/**
 * 카타카나 -> 히라가나 변환 (완벽 지원)
 * 예: ラーメン -> らーめん, ヴァイオリン -> ゔぁいおりん
 */
function toHiragana(str) {
    if (!str) return "";
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}

// 괄호 안의 히라가나 추출
function getCleanReading(text) {
    if (!text) return "";
    const matches = text.match(/\(([^)]+)\)/g);
    if (matches && matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        return lastMatch.replace('(', '').replace(')', '');
    }
    return text;
}

// 작은 글자 -> 큰 글자 (ゃ -> や)
function normalizeKana(char) {
    const smallMap = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ',
        'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
        'ヵ': 'か', 'ヶ': 'け'
    };
    return smallMap[char] || char;
}

/**
 * 끝말잇기 규칙 검증 함수
 */
function verifyShiritoriRule(previousWordRaw, currentReading) {
    // 1. 이전 단어 분석 (히라가나로 변환)
    let previousSoundRaw = getCleanReading(previousWordRaw);
    let previousSound = toHiragana(previousSoundRaw).trim(); 
    
    // 2. 끝 글자 추출
    let lastChar = normalizeKana(previousSound.slice(-1));

    // 장음(ー) 처리
    if (lastChar === 'ー') {
        const len = previousSound.length;
        if (len >= 2) {
            lastChar = normalizeKana(previousSound.slice(len - 2, len - 1));
        }
    }

    // 3. 현재 입력 단어 분석 (히라가나로 변환)
    let currentSound = toHiragana(currentReading).trim();
    const firstChar = normalizeKana(currentSound.charAt(0));

    console.log(`[규칙 검사] ${previousSound}(끝:${lastChar}) vs ${currentSound}(첫:${firstChar})`);

    return {
        isValid: lastChar === firstChar,
        requiredSound: lastChar,
        inputSound: firstChar
    };
}

module.exports = { getCleanReading, normalizeKana, verifyShiritoriRule, toHiragana };