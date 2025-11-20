// 괄호 안의 히라가나 추출 ("水(みず)" -> "みず")
function getCleanReading(text) {
    if (!text) return "";
    const match = text.match(/\(([^)]+)\)/);
    return match ? match[1] : text;
}

// 작은 글자를 큰 글자로 변환 (ゃ -> や)
function normalizeKana(char) {
    const smallMap = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ'
    };
    return smallMap[char] || char;
}

/**
 * 끝말잇기 규칙 검증 함수
 * @param {string} previousWordRaw - 이전 단어 (DB에 저장된 형태, 예: "海(うみ)")
 * @param {string} currentReading - 현재 입력한 단어의 읽기 (예: "みらい")
 */
function verifyShiritoriRule(previousWordRaw, currentReading) {
    const previousSound = getCleanReading(previousWordRaw); // "うみ"
    
    let lastChar = normalizeKana(previousSound.trim().slice(-1)); // 끝 글자

    // 장음(ー) 처리: 장음이면 그 앞 글자를 기준으로 함
    if (lastChar === 'ー') {
        const len = previousSound.trim().length;
        if (len >= 2) {
            lastChar = normalizeKana(previousSound.trim().slice(len - 2, len - 1));
        }
    }

    const firstChar = normalizeKana(currentReading.trim().charAt(0)); // 첫 글자

    return {
        isValid: lastChar === firstChar,
        requiredSound: lastChar,
        inputSound: firstChar
    };
}

module.exports = { getCleanReading, normalizeKana, verifyShiritoriRule };