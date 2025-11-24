const axios = require('axios');
const https = require('https');

// 🔑 API 키
const NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * 🧹 문자열 청소 함수 (특수문자 제거)
 */
function cleanString(str, lang) {
    if (!str) return "";
    let cleaned = str.split('(')[0].split('^')[0].split('-')[0].split('~')[0];
    if (lang === 'ko') cleaned = cleaned.replace(/[^가-힣]/g, '');
    else if (lang === 'ja') cleaned = cleaned.replace(/[^\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\u30fc]/g, '');
    return cleaned.trim();
}

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

/**
 * 통합 검사 함수
 */
async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return { isValid: false };
    if (lang === 'japanese' || lang === 'ja') return await checkJapaneseWord(word);
    if (lang === 'korean' || lang === 'ko') return await checkKoreanWord(word);
    return { isValid: true, reading: word };
}

// 🇯🇵 일본어 검사 (Jisho)
async function checkJapaneseWord(word) {
    if (/[가-힣]/.test(word)) return { isValid: false };
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const data = response.data;
        if (data.meta.status === 200 && data.data.length > 0) {
            const firstResult = data.data[0];
            const isNoun = firstResult.senses.some(sense => sense.parts_of_speech.some(pos => pos.toLowerCase().includes('noun') || pos.toLowerCase().includes('suru verb') || pos.toLowerCase().includes('pronoun')));
            if (!isNoun) return { isValid: false };
            
            const foundJa = firstResult.japanese[0];
            // 읽기 변환 적용
            const reading = toHiragana(cleanString(foundJa.reading || foundJa.word, 'ja'));
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) { return { isValid: true, reading: word }; }
}

// 🇰🇷 한국어 검사 (우리말샘 opendict + exact 검색)
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    const url = 'https://opendict.korean.go.kr/api/search'; // .do 없는 URL 확인
    
    try {
        const response = await axios.get(url, {
            params: {
                key: cleanKey, q: word, req_type: 'json', advanced: 'y', part: 'word',
                method: 'exact', // 정확 일치
                pos: '1', // 명사
                num: 10 
            },
            httpsAgent: httpsAgent, timeout: 5000
        });

        const data = response.data;
        
        if (typeof data === 'string') {
            console.error(`⚠️ [한국어 에러] ${data.substring(0, 100)}`);
            return { isValid: false };
        }

        if (!data || !data.channel || data.channel.total <= 0) return { isValid: false };
        
        const validItem = data.channel.item.find(item => {
            const apiWord = cleanString(item.word, 'ko');
            const isMatch = apiWord === word;
            const isNoun = item.pos.includes('명사') || item.pos.includes('대명사') || item.pos.includes('수사');
            return isMatch && isNoun;
        });

        if (validItem) {
            console.log(`✅ [한국어] '${word}' 통과`);
            return { isValid: true, reading: word };
        } else {
            console.log(`❌ [한국어] '${word}' 명사 아님`);
            return { isValid: false };
        }

    } catch (error) { return { isValid: false }; }
}

module.exports = { checkWordExists };