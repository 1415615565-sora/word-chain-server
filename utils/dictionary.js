const axios = require('axios');
const https = require('https');

// 🔑 API 키
let NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

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
 * 🎲 랜덤 단어 가져오기
 */
async function fetchRandomWord(lang) {
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');

    try {
        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            // 🚀 URL: 우리말샘
            const url = 'https://opendict.korean.go.kr/api/search';

            console.log(`📡 [랜덤] 요청: "${seed}"`);

            const response = await axios.get(url, {
                params: {
                    key: cleanKey, q: seed, req_type: 'json',
                    advanced: 'y', part: 'word', pos: '1', num: 30, 
                    sort: 'popular', method: 'include', type1: 'word'
                },
                httpsAgent: httpsAgent, timeout: 5000
            });

            if (typeof response.data === 'string') return null;

            const items = response.data?.channel?.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = cleanString(randomItem.word, 'ko');
                console.log(`✅ [랜덤] 성공: ${cleanWord}`);
                return { word: cleanWord, reading: cleanWord, lang: 'ko' };
            }
        } 
        else if (lang === 'ja') {
            const seed = JA_SEEDS[Math.floor(Math.random() * JA_SEEDS.length)];
            const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(seed)}`;
            const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
            
            const candidates = response.data.data.slice(0, 20).filter(item => item.senses.some(sense => sense.parts_of_speech.some(pos => pos.toLowerCase().includes('noun'))));
            if (candidates.length > 0) {
                const randomItem = candidates[Math.floor(Math.random() * candidates.length)];
                const jaData = randomItem.japanese[0];
                const word = cleanString(jaData.word || jaData.reading, 'ja');
                const reading = toHiragana(cleanString(jaData.reading || jaData.word, 'ja'));
                return { word, reading, lang: 'ja' };
            }
        }
    } catch (error) { console.error(`🚨 랜덤 실패:`, error.message); }
    return null;
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

// 🇯🇵 일본어 단어 검사
async function checkJapaneseWord(word) {
    if (/[가-힣]/.test(word)) return { isValid: false };
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const data = response.data;
        if (data.meta.status === 200 && data.data.length > 0) {
            const firstResult = data.data[0];
            const isNoun = firstResult.senses.some(sense => sense.parts_of_speech.some(pos => pos.toLowerCase().includes('noun') || pos.toLowerCase().includes('suru verb') || pos.toLowerCase().includes('pronoun')));
            
            if (!isNoun) {
                console.log(`❌ [일본어] '${word}'은(는) 명사가 아님`);
                return { isValid: false };
            }
            
            const foundJa = firstResult.japanese[0];
            const reading = toHiragana(cleanString(foundJa.reading || foundJa.word, 'ja'));
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) { return { isValid: true, reading: word }; }
}

// 🇰🇷 한국어 단어 검사 (수정됨 ⭐)
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    // 🚀 .do 제거된 정확한 주소
    const url = 'https://opendict.korean.go.kr/api/search'; 
    
    try {
        const response = await axios.get(url, {
            params: {
                key: cleanKey,
                q: word,
                req_type: 'json',
                advanced: 'y',
                part: 'word',
                // 🚀 [핵심 수정] exact(정확) 대신 include(포함) 사용!
                // API가 '나무'를 검색했을 때 '나무꾼'도 주겠지만, 일단 많이 받아와서 JS로 거릅니다.
                method: 'include', 
                pos: '1', // 명사
                num: 20 
            },
            httpsAgent: httpsAgent,
            timeout: 5000
        });

        const data = response.data;
        
        // 🚨 에러 체크 로그
        if (typeof data === 'string') {
            console.error(`⚠️ [한국어 검색 에러] XML 응답: ${data.substring(0, 100)}`);
            return { isValid: false };
        }

        if (!data || !data.channel || data.channel.total <= 0) {
            console.log(`❌ [한국어] '${word}' 검색 결과 0건`);
            return { isValid: false };
        }
        
        // 🧐 [정밀 검사] API 결과 중에서 내가 쓴 단어랑 '진짜 똑같은 명사' 찾기
        const validItem = data.channel.item.find(item => {
            const apiWord = cleanString(item.word, 'ko'); // 특수문자 제거한 API 단어
            
            // 입력한 단어(word)와 API 단어(apiWord)가 정확히 일치하는지 확인
            const isMatch = apiWord === word;
            const isNoun = (item.pos === '명사' || item.pos === '대명사' || item.pos === '수사');
            
            return isMatch && isNoun;
        });

        if (validItem) {
            console.log(`✅ [한국어] '${word}' 확인 완료 (품사: ${validItem.pos})`);
            return { isValid: true, reading: word };
        } else {
            console.log(`❌ [한국어] '${word}' 유사 단어는 있지만 정확한 명사가 아님`);
            return { isValid: false };
        }

    } catch (error) { 
        console.error(`🚨 [한국어 통신 에러]`, error.message);
        return { isValid: false }; 
    }
}

module.exports = { checkWordExists, fetchRandomWord };