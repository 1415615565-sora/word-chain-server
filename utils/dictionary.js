const axios = require('axios');
const https = require('https');

// 🔑 입력하신 API 키
const NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

// SSL 에러 방지
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '물', '불', '흙', '산', '강', '밥', '집', '옷', '꽃', '달', '해', '별'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と'];

/**
 * 🧹 문자열 청소 함수
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
 * 🎲 랜덤 단어 가져오기 (URL 변경 및 디버깅 강화)
 */
async function fetchRandomWord(lang) {
    try {
        const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');

        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            
            // 🚀 [변경 1] URL을 '우리말샘(opendict)'으로 변경
            // (표준국어대사전 stdict 키가 아닐 경우를 대비)
            const url = 'https://opendict.korean.go.kr/api/search.do';

            console.log(`📡 [한국어] 랜덤 단어 요청: "${seed}" (URL: opendict)`);

            const response = await axios.get(url, {
                params: {
                    key: cleanKey,
                    q: seed,
                    req_type: 'json',
                    advanced: 'y',
                    part: 'word',
                    pos: '1', // 명사
                    num: 30,
                    sort: 'popular',
                    method: 'include',
                    type1: 'word'
                },
                httpsAgent: httpsAgent,
                timeout: 5000
            });

            const data = response.data;
            
            // 🚨 [디버깅] JSON이 아닐 경우 에러 내용 출력
            if (typeof data === 'string') {
                console.error(`⚠️ [한국어 API 에러] JSON이 아닙니다. 응답 내용 확인:`);
                console.error(data.substring(0, 300)); // 에러 내용을 콘솔에 보여줌 (중요!)
                
                // 만약 키 오류라면 null 반환
                return null;
            }

            const items = data?.channel?.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = cleanString(randomItem.word, 'ko');
                console.log(`✅ [한국어] 가져옴: ${cleanWord}`);
                return { word: cleanWord, reading: cleanWord, lang: 'ko' };
            }
        } 
        else if (lang === 'ja') {
            // (일본어 로직은 그대로 유지)
            const seed = JA_SEEDS[Math.floor(Math.random() * JA_SEEDS.length)];
            const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(seed)}`;
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
            const candidates = response.data.data.slice(0, 20).filter(item => item.senses.some(sense => sense.parts_of_speech.some(pos => pos.toLowerCase().includes('noun'))));

            if (candidates.length > 0) {
                const randomItem = candidates[Math.floor(Math.random() * candidates.length)];
                const jaData = randomItem.japanese[0];
                const word = cleanString(jaData.word || jaData.reading, 'ja');
                const reading = toHiragana(cleanString(jaData.reading || jaData.word, 'ja'));
                console.log(`✅ [일본어] 가져옴: ${word}(${reading})`);
                return { word, reading, lang: 'ja' };
            }
        }
    } catch (error) {
        console.error(`🚨 [랜덤 단어 실패] ${lang} 오류:`, error.message);
    }
    return null;
}

/**
 * 통합 검사 함수 (URL 변경 적용)
 */
async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return { isValid: false };
    if (lang === 'japanese' || lang === 'ja') return await checkJapaneseWord(word);
    if (lang === 'korean' || lang === 'ko') return await checkKoreanWord(word);
    return { isValid: true, reading: word };
}

async function checkJapaneseWord(word) {
    if (/[가-힣]/.test(word)) return { isValid: false };
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = response.data;
        if (data.meta.status === 200 && data.data.length > 0) {
            const firstResult = data.data[0];
            const isNoun = firstResult.senses.some(sense => sense.parts_of_speech.some(pos => pos.toLowerCase().includes('noun') || pos.toLowerCase().includes('suru verb') || pos.toLowerCase().includes('pronoun')));
            if (!isNoun) return { isValid: false };
            const foundJa = firstResult.japanese[0];
            const reading = toHiragana(cleanString(foundJa.reading || foundJa.word, 'ja'));
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) { return { isValid: true, reading: word }; }
}

async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    
    // 🚀 [변경 2] 검사할 때도 '우리말샘(opendict)' 사용
    const url = 'https://opendict.korean.go.kr/api/search.do';
    
    try {
        const response = await axios.get(url, {
            params: { key: cleanKey, q: word, req_type: 'json', advanced: 'y', part: 'word', method: 'exact' },
            httpsAgent: httpsAgent, timeout: 5000
        });
        const data = response.data;
        
        if (typeof data === 'string' || !data || !data.channel || data.channel.total <= 0) return { isValid: false };
        
        const validItem = data.channel.item.find(item => {
            const apiWord = cleanString(item.word, 'ko');
            return apiWord === word && (item.pos === '명사' || item.pos === '대명사' || item.pos === '수사');
        });
        return validItem ? { isValid: true, reading: word } : { isValid: false };
    } catch (error) { return { isValid: false }; }
}

module.exports = { checkWordExists, fetchRandomWord };