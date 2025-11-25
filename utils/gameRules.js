/**
 * 🔄 카타카나 -> 히라가나 변환
 */
function toHiragana(str) {
    if (!str) return "";
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}

// 괄호 안의 내용 추출
function getCleanReading(text) {
    if (!text) return "";
    const matches = text.match(/\(([^)]+)\)/g);
    if (matches && matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        return lastMatch.replace('(', '').replace(')', '');
    }
    return text;
}

// 일본어 작은 글자 정규화
function normalizeKana(char) {
    const smallMap = {
        'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お',
        'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ',
        'ヵ': 'か', 'ヶ': 'け'
    };
    return smallMap[char] || char;
}

/**
 * 🇰🇷 [핵심 추가] 두음법칙 적용 가능한 글자 목록 반환
 * 예: '리' -> ['리', '이'], '로' -> ['로', '노'], '녀' -> ['녀', '여']
 */
function getDueumVariations(char) {
    const code = char.charCodeAt(0);
    
    // 한글이 아니면 그대로 반환
    if (code < 0xAC00 || code > 0xD7A3) return [char];

    // 한글 유니코드 분해 (초성, 중성, 종성)
    const base = code - 0xAC00;
    const initial = Math.floor(base / 588);        // 초성 인덱스
    const medial = Math.floor((base % 588) / 28);  // 중성 인덱스
    const final = base % 28;                       // 종성 인덱스

    /* [초성 인덱스]
       ㄴ(2), ㄹ(5), ㅇ(11)
       
       [중성 인덱스] (두음법칙 관련)
       ㅏ(0), ㅐ(1), ㅑ(2), ㅓ(4), ㅔ(5), ㅕ(6), ㅖ(7), ㅗ(8), ㅘ(9), 
       ㅚ(11), ㅛ(12), ㅜ(13), ㅝ(14), ㅞ(15), ㅟ(16), ㅠ(17), ㅡ(18), ㅢ(19), ㅣ(20)
    */

    let variations = [char]; // 원본은 무조건 포함

    // 1. [ㄴ -> ㅇ] : 녀, 뇨, 뉴, 니 -> 여, 요, 유, 이
    // (초성 'ㄴ' + 중성 'ㅕ, ㅛ, ㅠ, ㅣ')
    if (initial === 2 && [6, 12, 17, 20].includes(medial)) {
        const newChar = String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final);
        variations.push(newChar);
    }

    // 2. [ㄹ -> ㄴ] : 라, 로, 루, 르... -> 나, 노, 누, 느...
    // (초성 'ㄹ' + 중성 'ㅏ, ㅐ, ㅓ, ㅔ, ㅗ, ㅚ, ㅜ, ㅟ, ㅡ')
    if (initial === 5 && [0, 1, 4, 5, 8, 11, 13, 16, 18].includes(medial)) {
        const newChar = String.fromCharCode(0xAC00 + (2 * 588) + (medial * 28) + final);
        variations.push(newChar);
    }

    // 3. [ㄹ -> ㅇ] : 랴, 려, 례, 료, 류, 리 -> 야, 여, 예, 요, 유, 이
    // (초성 'ㄹ' + 중성 'ㅑ, ㅕ, ㅖ, ㅛ, ㅠ, ㅣ')
    if (initial === 5 && [2, 6, 7, 12, 17, 20].includes(medial)) {
        const newChar = String.fromCharCode(0xAC00 + (11 * 588) + (medial * 28) + final);
        variations.push(newChar);
    }

    return variations;
}

/**
 * 끝말잇기 규칙 검증 함수 (한글 두음법칙 + 일본어 장음/작은글자 통합)
 */
function verifyShiritoriRule(previousWordRaw, currentReading) {
    // 1. 이전 단어 정리
    let previousSoundRaw = getCleanReading(previousWordRaw);
    
    // 2. 언어 감지 (한글인지 일본어인지)
    const isKorean = /[가-힣]/.test(previousSoundRaw);
    
    // === 🇰🇷 한국어 규칙 (두음법칙) ===
    if (isKorean) {
        // 이전 단어의 끝 글자
        const lastChar = previousSoundRaw.slice(-1);
        
        // 입력한 단어의 첫 글자
        const firstChar = currentReading.charAt(0);

        // 두음법칙 변형 목록 가져오기 (예: '리' -> ['리', '이'])
        const allowedChars = getDueumVariations(lastChar);

        console.log(`🔍 [한글 규칙] 끝글자: ${lastChar} (허용: ${allowedChars.join(',')}) vs 입력: ${firstChar}`);

        return {
            isValid: allowedChars.includes(firstChar),
            requiredSound: allowedChars.join(' 또는 '), // "리 또는 이"
            inputSound: firstChar
        };
    } 
    
    // === 🇯🇵 일본어 규칙 (히라가나) ===
    else {
        let previousSound = toHiragana(previousSoundRaw).trim();
        let lastChar = normalizeKana(previousSound.slice(-1));

        // 장음 처리
        if (lastChar === 'ー') {
            const len = previousSound.length;
            if (len >= 2) {
                lastChar = normalizeKana(previousSound.slice(len - 2, len - 1));
            }
        }

        let currentSound = toHiragana(currentReading).trim();
        const firstChar = normalizeKana(currentSound.charAt(0));

        console.log(`🔍 [일본어 규칙] 끝:${lastChar} vs 첫:${firstChar}`);

        return {
            isValid: lastChar === firstChar,
            requiredSound: lastChar,
            inputSound: firstChar
        };
    }
}

module.exports = { getCleanReading, normalizeKana, verifyShiritoriRule, toHiragana };
