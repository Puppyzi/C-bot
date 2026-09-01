const db = require('../database/db.js');

// Node clamps larger timer delays to 1 ms. Staying below the signed 32-bit
// limit lets long demotions wake up in safe stages instead of busy-looping.
const MAX_TIMER_DELAY_MS = 2_000_000_000;
const BASE_RETRY_DELAY_MS = 60_000;
const MAX_RETRY_DELAY_MS = 60 * 60 * 1000;

let nextCheckTimeout = null;
let client = null;
let isCheckingDemotions = false;
const restoringDemotions = new Set();

function demotionKey(userId, roleId) {
    return `${userId}-${roleId}`;
}

function calculateTimerDelay(targetTime, now = Date.now()) {
    const remaining = Math.max(0, targetTime - now);
    return Math.min(remaining + 1000, MAX_TIMER_DELAY_MS);
}

function calculateRetryDelay(attemptCount) {
    const exponent = Math.max(0, attemptCount - 1);
    return Math.min(BASE_RETRY_DELAY_MS * (2 ** exponent), MAX_RETRY_DELAY_MS);
}

function getNextDueDemotion() {
    return db.prepare(`
        SELECT *, MAX(restore_at, COALESCE(next_attempt_at, 0)) AS due_at
        FROM demotions
        WHERE restored = 0
        ORDER BY due_at ASC
        LIMIT 1
    `).get();
}

function scheduleNextDemotionCheck() {
    if (nextCheckTimeout) {
        clearTimeout(nextCheckTimeout);
        nextCheckTimeout = null;
    }

    if (!client) return;

    const nextDemotion = getNextDueDemotion();
    if (!nextDemotion) {
        console.log('[Demotions] No active demotions. Scheduler idle.');
        return;
    }

    const delay = calculateTimerDelay(nextDemotion.due_at);
    console.log(`[Demotions] Next check scheduled in ${Math.round(delay / 1000)} seconds.`);

    nextCheckTimeout = setTimeout(async () => {
        try {
            await checkDemotions();
        } catch (error) {
            console.error('[Demotions] Scheduled check failed:', error);
        } finally {
            scheduleNextDemotionCheck();
        }
    }, delay);
}

function startDemotionScheduler(discordClient) {
    client = discordClient;
    scheduleNextDemotionCheck();
}

function stopDemotionScheduler() {
    if (nextCheckTimeout) {
        clearTimeout(nextCheckTimeout);
        nextCheckTimeout = null;
    }
    client = null;
}

function isRestoring(userId, roleId) {
    return restoringDemotions.has(demotionKey(userId, roleId));
}

function recordRestoreFailure(demotion, error) {
    const attemptCount = Number(demotion.attempt_count || 0) + 1;
    const nextAttemptAt = Date.now() + calculateRetryDelay(attemptCount);
    const errorMessage = String(error?.message || error || 'Unknown restoration error').slice(0, 1000);

    db.prepare(`
        UPDATE demotions
        SET attempt_count = ?, next_attempt_at = ?, last_error = ?
        WHERE id = ? AND restored = 0
    `).run(attemptCount, nextAttemptAt, errorMessage, demotion.id);

    console.error(
        `[Demotions] Restore failed for record ${demotion.id}; retry ${attemptCount} scheduled ` +
        `for ${new Date(nextAttemptAt).toISOString()}: ${errorMessage}`
    );

    return { attemptCount, nextAttemptAt, errorMessage };
}

async function restoreDemotion(demotion, options = {}) {
    if (!client) {
        throw new Error('Demotion scheduler has not been started.');
    }

    const key = demotionKey(demotion.user_id, demotion.role_id);
    if (restoringDemotions.has(key)) {
        return { restored: false, busy: true, error: 'This role is already being restored.' };
    }

    restoringDemotions.add(key);

    try {
        const guild = await client.guilds.fetch(demotion.guild_id);
        const member = await guild.members.fetch(demotion.user_id);
        const role = await guild.roles.fetch(demotion.role_id);

        if (!role) {
            throw new Error(`Role ${demotion.role_id} no longer exists.`);
        }

        await member.roles.add(
            role,
            options.auditReason || 'Timed demotion expired - role restored automatically'
        );

        // Only mark the record restored after Discord confirms the role add.
        db.prepare(`
            UPDATE demotions
            SET restored = 1, restored_at = ?, next_attempt_at = NULL,
                attempt_count = 0, last_error = NULL
            WHERE id = ? AND restored = 0
        `).run(Date.now(), demotion.id);

        console.log(`[Demotions] Restored ${role.name} to ${member.user.tag} in ${guild.name}`);

        if (options.notifyUser !== false) {
            try {
                await member.send(
                    options.dmMessage ||
                    `Your temporary demotion has ended. Your **${role.name}** role in **${guild.name}** has been restored.`
                );
            } catch {
                // DMs may be disabled; role restoration still succeeded.
            }
        }

        return { restored: true, role, member, guild };
    } catch (error) {
        const retry = recordRestoreFailure(demotion, error);
        return { restored: false, error: retry.errorMessage, nextAttemptAt: retry.nextAttemptAt };
    } finally {
        // Keep the exemption briefly because Discord may emit guildMemberUpdate
        // just after the REST request resolves.
        const cleanupTimer = setTimeout(() => restoringDemotions.delete(key), 5000);
        cleanupTimer.unref?.();
    }
}

async function checkDemotions() {
    if (isCheckingDemotions || !client) return;
    isCheckingDemotions = true;

    try {
        const now = Date.now();
        const expiredDemotions = db.prepare(`
            SELECT * FROM demotions
            WHERE restore_at <= ?
              AND COALESCE(next_attempt_at, 0) <= ?
              AND restored = 0
        `).all(now, now);

        for (const demotion of expiredDemotions) {
            await restoreDemotion(demotion);
        }
    } finally {
        isCheckingDemotions = false;
    }
}

module.exports = {
    MAX_TIMER_DELAY_MS,
    calculateRetryDelay,
    calculateTimerDelay,
    checkDemotions,
    isRestoring,
    restoreDemotion,
    scheduleNextDemotionCheck,
    startDemotionScheduler,
    stopDemotionScheduler
};
