/**
 * 카타카나를 히라가나로 변환하는 헬퍼 함수
 * 예: "ゴリラ" -> "ごりら"
 */
function toHiragana(str) {
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}

// 괄호 안의 히라가나 추출 ("水(みず)" -> "みず")
function getCleanReading(text) {
    if (!text) return "";
    const match = text.match(/\(([^)]+)\)/);
    return match ? match[1] : text;
}

// 작은 글자를 큰 글자로 변환 (ゃ -> や, っ -> つ)
function normalizeKana(char) {
    const smallMap = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ',
        'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
        'ヵ': 'か', 'ヶ': 'け' // 카타카나 전용 작은 글자도 처리
    };
    return smallMap[char] || char;
}

/**
 * 끝말잇기 규칙 검증 함수 (히라가나/카타카나 혼용 지원)
 * @param {string} previousWordRaw - 이전 단어 (DB 저장값, 예: "ゲーム" 또는 "海(うみ)")
 * @param {string} currentReading - 현재 입력 단어의 읽기 (예: "むら")
 */
function verifyShiritoriRule(previousWordRaw, currentReading) {
    // 1. 이전 단어 읽기 추출 및 히라가나화 ("ゲーム" -> "げーむ")
    let previousSound = getCleanReading(previousWordRaw);
    previousSound = toHiragana(previousSound); 
    
    // 2. 현재 입력 단어도 히라가나화 ("ムラ" -> "むら")
    let currentSound = toHiragana(currentReading);

    // 3. 이전 단어의 끝 글자 추출 (장음 처리 포함)
    let lastChar = normalizeKana(previousSound.trim().slice(-1)); // 끝 글자

    // 장음(ー) 처리: 앞 글자의 모음을 따라가거나, 편의상 앞 글자 자체를 끝 글자로 봄
    // (보통 끝말잇기 룰에서는 장음 앞 글자를 기준으로 합니다)
    if (lastChar === 'ー') {
        const len = previousSound.trim().length;
        if (len >= 2) {
            lastChar = normalizeKana(previousSound.trim().slice(len - 2, len - 1));
        }
    }

    // 4. 현재 단어의 첫 글자 추출
    const firstChar = normalizeKana(currentSound.trim().charAt(0)); // 첫 글자

    // 5. 비교 (이제 둘 다 히라가나이므로 비교 가능)
    return {
        isValid: lastChar === firstChar,
        requiredSound: lastChar,
        inputSound: firstChar
    };
}

module.exports = { getCleanReading, normalizeKana, verifyShiritoriRule, toHiragana };