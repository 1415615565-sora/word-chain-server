/**
 * 카타카나 -> 히라가나 변환
 */
function toHiragana(str) {
    if (!str) return "";
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}

// 괄호 안의 히라가나 추출 ("学校(がっこう)" -> "がっこう")
// 실패 시 원본 반환 ("みず" -> "みず")
function getCleanReading(text) {
    if (!text) return "";
    
    // 1. 괄호 안에 있는 내용 추출 (여러 개일 경우 마지막 괄호 기준)
    const matches = text.match(/\(([^)]+)\)/g);
    if (matches && matches.length > 0) {
        // "ABC(def)" -> "def"
        const lastMatch = matches[matches.length - 1];
        return lastMatch.replace('(', '').replace(')', '');
    }
    
    // 2. 괄호가 없으면 그냥 텍스트 반환 (이미 히라가나인 경우)
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

function verifyShiritoriRule(previousWordRaw, currentReading) {
    // 1. 이전 단어 분석
    let previousSoundRaw = getCleanReading(previousWordRaw); // 괄호 제거
    let previousSound = toHiragana(previousSoundRaw).trim(); // 히라가나화 및 공백 제거
    
    // 2. 끝 글자 추출
    let lastChar = normalizeKana(previousSound.slice(-1)); // 기본 끝 글자

    // 장음(ー) 처리: "서-버-" -> "서-버" (앞 글자 기준)
    if (lastChar === 'ー') {
        const len = previousSound.length;
        if (len >= 2) {
            lastChar = normalizeKana(previousSound.slice(len - 2, len - 1));
        }
    }

    // 3. 현재 입력 단어 분석
    let currentSound = toHiragana(currentReading).trim();
    const firstChar = normalizeKana(currentSound.charAt(0));

    //서버 콘솔에서 확인하세요!
    console.log(`🔍 [규칙 검사]`);
    console.log(`   - 이전 단어(원본): ${previousWordRaw}`);
    console.log(`   - 이전 단어(읽기): ${previousSound}`);
    console.log(`   - 요구하는 시작 글자: '${lastChar}'`);
    console.log(`   - 입력한 단어(읽기): ${currentSound}`);
    console.log(`   - 입력한 시작 글자: '${firstChar}'`);

    return {
        isValid: lastChar === firstChar,
        requiredSound: lastChar,
        inputSound: firstChar
    };
}

module.exports = { getCleanReading, normalizeKana, verifyShiritoriRule, toHiragana };