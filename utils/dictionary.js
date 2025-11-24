const axios = require('axios');
const https = require('https');

// 🔑 API 키 (공백 제거 포함)
let NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '물', '산', '강', '밥', '집', '옷', '꽃', '달', '해', '별'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と'];

/**
 * 🎲 랜덤 단어 가져오기 (즉시 호출)
 */
async function fetchRandomWord(lang) {
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');

    try {
        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            const url = 'https://stdict.korean.go.kr/api/search.do';

            console.log(`📡 [한국어] 단어 요청 시작: "${seed}"`);

            const response = await axios.get(url, {
                params: {
                    key: cleanKey,
                    q: seed,
                    req_type: 'json',
                    advanced: 'y',
                    part: 'word',
                    pos: '1',
                    num: 20,
                    sort: 'popular',
                    method: 'include',
                    type1: 'word'
                },
                httpsAgent: httpsAgent,
                timeout: 5000 // 5초 기다림
            });

            const data = response.data;
            if (typeof data === 'string') return null;

            const items = data?.channel?.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = randomItem.word.replace(/[^가-힣]/g, '');
                console.log(`✅ [한국어] 가져옴: ${cleanWord}`);
                return { word: cleanWord, reading: cleanWord, lang: 'ko' };
            }
        } 
        else if (lang === 'ja') {
            const seed = JA_SEEDS[Math.floor(Math.random() * JA_SEEDS.length)];
            const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(seed)}`;
            
            console.log(`📡 [일본어] 단어 요청 시작: "${seed}"`);

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
                const word = jaData.word || jaData.reading;
                const reading = jaData.reading || jaData.word;
                console.log(`✅ [일본어] 가져옴: ${word}`);
                return { word, reading, lang: 'ja' };
            }
        }
    } catch (error) {
        console.error(`🚨 API 호출 실패 (${lang}):`, error.message);
    }
    return null; // 실패 시 null (기본 단어 사용)
}

/**
 * (기존) 통합 검사 함수 (변경 없음)
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
            return { isValid: true, reading: foundJa.reading || foundJa.word };
        }
        return { isValid: false };
    } catch (error) { return { isValid: true, reading: word }; }
}

async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    const url = 'https://stdict.korean.go.kr/api/search.do';
    try {
        const response = await axios.get(url, {
            params: { key: cleanKey, q: word, req_type: 'json', advanced: 'y', part: 'word', method: 'exact' },
            httpsAgent: httpsAgent, timeout: 5000
        });
        const data = response.data;
        if (typeof data === 'string' || !data || !data.channel || data.channel.total <= 0) return { isValid: false };
        const validItem = data.channel.item.find(item => {
            return item.word.replace(/[^가-힣]/g, '') === word && (item.pos === '명사' || item.pos === '대명사' || item.pos === '수사');
        });
        return validItem ? { isValid: true, reading: word } : { isValid: false };
    } catch (error) { return { isValid: false }; }
}

module.exports = { checkWordExists, fetchRandomWord };