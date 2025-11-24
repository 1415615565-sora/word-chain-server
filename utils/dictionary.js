const axios = require('axios');
const https = require('https');

// 🔑 국립국어원(표준국어대사전) API 키 입력 필수!
const NIKL_API_KEY = '여기에_발급받은_API_키를_넣으세요'; 

// SSL 에러 방지용 에이전트
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 랜덤 단어 추출을 위한 검색 시드
const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '기', '노', '무', '부', '소', '오', '우', '지', '치', '코', '토', '포'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と', 'な', 'に', 'ぬ', 'ね', 'の'];

/**
 * 🎲 사전에서 랜덤 명사 가져오기
 */
async function fetchRandomWord(lang) {
    try {
        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            const url = 'https://stdict.korean.go.kr/api/search.do';

            const response = await axios.get(url, {
                params: {
                    key: NIKL_API_KEY,
                    q: seed,
                    req_type: 'json',
                    advanced: 'y',
                    part: 'word',
                    pos: '1', // 명사
                    num: 50,
                    sort: 'popular',
                    method: 'include'
                },
                httpsAgent: httpsAgent,
                timeout: 3000
            });

            const items = response.data?.channel?.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = randomItem.word.replace(/[^가-힣]/g, '');
                return { word: cleanWord, reading: cleanWord, lang: 'ko' };
            }
        } 
        else if (lang === 'ja') {
            const seed = JA_SEEDS[Math.floor(Math.random() * JA_SEEDS.length)];
            const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(seed)}`;
            
            const response = await axios.get(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 3000
            });

            const candidates = response.data.data.slice(0, 20).filter(item => {
                return item.senses.some(sense => 
                    sense.parts_of_speech.some(pos => pos.toLowerCase().includes('noun'))
                );
            });

            if (candidates.length > 0) {
                const randomItem = candidates[Math.floor(Math.random() * candidates.length)];
                const jaData = randomItem.japanese[0];
                return { 
                    word: jaData.word || jaData.reading, 
                    reading: jaData.reading || jaData.word,
                    lang: 'ja' 
                };
            }
        }
    } catch (error) {
        console.error('랜덤 단어 추출 실패:', error.message);
    }
    return null;
}

/**
 * 🇯🇵 일본어 단어 검증
 */
async function checkJapaneseWord(word) {
    if (/[가-힣]/.test(word)) return { isValid: false };

    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const data = response.data;
        
        if (data.meta.status === 200 && data.data.length > 0) {
            const firstResult = data.data[0];
            const isNoun = firstResult.senses.some(sense => 
                sense.parts_of_speech.some(pos => 
                    pos.toLowerCase().includes('noun') || 
                    pos.toLowerCase().includes('suru verb') ||
                    pos.toLowerCase().includes('pronoun')
                )
            );
            if (!isNoun) return { isValid: false };

            const foundJa = firstResult.japanese[0];
            let reading = foundJa.reading || foundJa.word;
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) {
        console.error('일본어 사전 오류:', error.message);
        return { isValid: true, reading: word }; 
    }
}

/**
 * 🇰🇷 한국어 단어 검증
 */
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };

    const url = 'https://stdict.korean.go.kr/api/search.do';
    try {
        const response = await axios.get(url, {
            params: {
                key: NIKL_API_KEY,
                q: word,
                req_type: 'json',
                advanced: 'y',
                part: 'word',
                method: 'exact'
            },
            httpsAgent: httpsAgent,
            timeout: 5000
        });

        const data = response.data;
        if (!data || !data.channel || data.channel.total <= 0) return { isValid: false };

        const items = data.channel.item;
        const validItem = items.find(item => {
            const cleanWord = item.word.replace(/[^가-힣]/g, '');
            if (cleanWord !== word) return false;
            return item.pos === '명사' || item.pos === '대명사' || item.pos === '수사';
        });

        if (validItem) return { isValid: true, reading: word };
        else return { isValid: false };
    } catch (error) {
        console.error('국립국어원 API 오류:', error.message);
        return { isValid: false }; 
    }
}

async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return { isValid: false };
    if (lang === 'japanese' || lang === 'ja') return await checkJapaneseWord(word);
    if (lang === 'korean' || lang === 'ko') return await checkKoreanWord(word);
    return { isValid: true, reading: word };
}

module.exports = { checkWordExists, fetchRandomWord };