function splitLongLine(line, maxLength) {
    const pieces = [];
    let remaining = line;

    while (remaining.length > maxLength) {
        let splitAt = remaining.lastIndexOf(' ', maxLength);
        if (splitAt < Math.floor(maxLength * 0.5)) splitAt = maxLength;
        pieces.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }

    if (remaining) pieces.push(remaining);
    return pieces;
}

function chunkLines(lines, maxLength) {
    if (maxLength < 1) throw new Error('maxLength must be positive.');

    const chunks = [];
    let current = '';

    for (const originalLine of lines) {
        const linePieces = originalLine.length > maxLength
            ? splitLongLine(originalLine, maxLength)
            : [originalLine];

        for (const line of linePieces) {
            const candidate = current ? `${current}\n${line}` : line;
            if (candidate.length > maxLength && current) {
                chunks.push(current);
                current = line;
            } else {
                current = candidate;
            }
        }
    }

    if (current) chunks.push(current);
    return chunks;
}

function truncateText(text, maxLength, suffix = '…') {
    if (text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - suffix.length)) + suffix;
}

module.exports = { chunkLines, truncateText };
