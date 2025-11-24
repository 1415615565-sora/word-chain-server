const axios = require('axios');
const https = require('https');

// 🔑 입력해주신 API 키 (대괄호/공백 제거 로직 적용됨)
let NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

// SSL 에러 방지 (필수)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '물', '불', '흙', '산', '강', '밥', '집', '옷', '꽃', '달', '해', '별'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と'];

/**
 * 🧹 문자열 청소 함수 (특수문자 제거)
 */
function cleanString(str, lang) {
    if (!str) return "";
    // 특수문자(^)나 설명괄호() 등을 제거
    let cleaned = str.split('(')[0].split('^')[0].split('-')[0].split('~')[0];
    
    if (lang === 'ko') cleaned = cleaned.replace(/[^가-힣]/g, '');
    else if (lang === 'ja') cleaned = cleaned.replace(/[^\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\u30fc]/g, '');
    
    return cleaned.trim();
}

/**
 * 🔄 헬퍼: 카타카나 -> 히라가나 변환
 */
function toHiragana(str) {
    if (!str) return "";
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
        var chr = match.charCodeAt(0) - 0x60;
        return String.fromCharCode(chr);
    });
}

/**
 * 🎲 랜덤 단어 가져오기 (URL 수정됨 ⭐)
 */
async function fetchRandomWord(lang) {
    // 키 정제 (공백 제거)
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');

    try {
        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            
            // 🚀 [수정된 부분] .do 제거! 정확한 우리말샘 API 주소
            const url = 'https://opendict.korean.go.kr/api/search';

            console.log(`📡 [한국어] 랜덤 단어 요청: "${seed}" (URL: opendict)`);

            const response = await axios.get(url, {
                params: {
                    key: cleanKey,
                    q: seed,
                    req_type: 'json', // JSON 요청
                    advanced: 'y',
                    part: 'word',
                    pos: '1',     // 명사
                    num: 30,      // 30개 조회
                    sort: 'popular',
                    method: 'include',
                    type1: 'word'
                },
                httpsAgent: httpsAgent,
                timeout: 5000
            });

            const data = response.data;
            
            // 🚨 [에러 진단] JSON이 아닌 XML 에러가 왔을 때 확인용
            if (typeof data === 'string') {
                console.error(`⚠️ [한국어 API 에러] 응답이 JSON이 아님 (내용 확인):`);
                console.error(data.substring(0, 300)); 
                return null;
            }

            const items = data?.channel?.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = cleanString(randomItem.word, 'ko');
                console.log(`✅ [한국어] 가져옴: ${cleanWord}`);
                return { word: cleanWord, reading: cleanWord, lang: 'ko' };
            } else {
                console.log(`⚠️ [한국어] "${seed}" 검색 결과 없음`);
            }
        } 
        else if (lang === 'ja') {
            // 일본어 로직 (Jisho) - 변경 없음
            const seed = JA_SEEDS[Math.floor(Math.random() * JA_SEEDS.length)];
            const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(seed)}`;
            
            console.log(`📡 [일본어] 랜덤 단어 요청: "${seed}"`);

            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 5000
            });

            const candidates = response.data.data.slice(0, 20).filter(item => {
                return item.senses.some(sense => 
                    sense.parts_of_speech.some(pos => pos.toLowerCase().includes('noun'))
                );
            });

            if (candidates.length > 0) {
                const randomItem = candidates[Math.floor(Math.random() * candidates.length)];
                const jaData = randomItem.japanese[0];
                
                const word = cleanString(jaData.word || jaData.reading, 'ja');
                const readingRaw = jaData.reading || jaData.word;
                const reading = toHiragana(cleanString(readingRaw, 'ja'));
                
                console.log(`✅ [일본어] 가져옴: ${word}(${reading})`);
                return { word, reading, lang: 'ja' };
            }
        }
    } catch (error) {
        console.error(`🚨 [랜덤 단어 실패] ${lang} 오류:`, error.message);
    }
    return null; // 실패 시 null 반환 (기본 단어 사용)
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

// 일본어 단어 검사 (변경 없음)
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

// 한국어 단어 검사 (URL 수정됨 ⭐)
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    
    // 🚀 [수정된 부분] .do 제거
    const url = 'https://opendict.korean.go.kr/api/search';
    
    try {
        const response = await axios.get(url, {
            params: { key: cleanKey, q: word, req_type: 'json', advanced: 'y', part: 'word', method: 'exact' },
            httpsAgent: httpsAgent, timeout: 5000
        });
        const data = response.data;
        
        if (typeof data === 'string') return { isValid: false }; // 에러 응답

        if (!data || !data.channel || data.channel.total <= 0) return { isValid: false };
        
        const validItem = data.channel.item.find(item => {
            const apiWord = cleanString(item.word, 'ko');
            return apiWord === word && (item.pos === '명사' || item.pos === '대명사' || item.pos === '수사');
        });
        return validItem ? { isValid: true, reading: word } : { isValid: false };
    } catch (error) { return { isValid: false }; }
}

module.exports = { checkWordExists, fetchRandomWord };