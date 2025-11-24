const axios = require('axios');
const https = require('https');

// 🔑 API 키
const NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 랜덤 단어용 시드
const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '물', '산', '강', '집', '꿈', '별'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と'];

/**
 * 🧹 문자열 청소 함수 (특수문자, 번호, 괄호 제거)
 */
function cleanString(str, lang) {
    if (!str) return "";
    
    let cleaned = str;
    // 1. 괄호, 삿갓(^), 물결(~) 뒤 제거가 아니라 '문자'만 남기기 전략
    // (우리말샘은 '자전거-1' 처럼 하이픈을 씁니다)
    cleaned = cleaned.split('(')[0]; 
    
    if (lang === 'ko') {
        // 한글만 남기고 나머지(특수문자, 숫자, 하이픈 등) 다 제거
        cleaned = cleaned.replace(/[^가-힣]/g, '');
    } else if (lang === 'ja') {
        // 일본어 문자만 남김
        cleaned = cleaned.replace(/[^\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\u30fc]/g, '');
    }
    
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
            const url = 'https://opendict.korean.go.kr/api/search';

            console.log(`📡 [한국어] 랜덤 요청: "${seed}"`);

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
                    method: 'include', // 포함 검색
                    type1: 'word'
                },
                httpsAgent: httpsAgent,
                timeout: 5000
            });

            const data = response.data;
            if (typeof data === 'string' || !data?.channel?.item) return null;

            const items = data.channel.item;
            if (items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = cleanString(randomItem.word, 'ko');
                console.log(`✅ [한국어] 랜덤 성공: ${cleanWord}`);
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

// 🇰🇷 한국어 단어 검사 (광역 검색 + 정밀 필터링)
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    const url = 'https://opendict.korean.go.kr/api/search';
    
    try {
        const response = await axios.get(url, {
            params: {
                key: cleanKey,
                q: word,
                req_type: 'json',
                advanced: 'y',
                part: 'word',
                // 🚀 [핵심] 'include'로 넓게 잡고, 개수를 50개로 늘려서 다 가져옴
                method: 'include', 
                pos: '1', // 명사
                num: 50 
            },
            httpsAgent: httpsAgent,
            timeout: 5000
        });

        const data = response.data;
        
        if (typeof data === 'string') {
            console.error(`⚠️ [API 에러] ${data.substring(0, 100)}`);
            return { isValid: false };
        }

        if (!data || !data.channel || data.channel.total <= 0) {
            console.log(`❌ [한국어] '${word}' 검색 결과 0건`);
            return { isValid: false };
        }
        
        const items = data.channel.item;

        // 🔍 [디버깅 로그] API가 뭘 가져왔는지 눈으로 확인 (최대 5개만 출력)
        const candidates = items.slice(0, 5).map(i => `${i.word}(${i.pos})`).join(', ');
        console.log(`🔎 '${word}' 검색 결과 후보: ${candidates}... (총 ${items.length}개)`);

        // 🎯 [정밀 필터링] 진짜 똑같은 명사 찾기
        const validItem = items.find(item => {
            const apiWord = cleanString(item.word, 'ko'); // "자전거-1" -> "자전거"
            
            // 1. 글자가 정확히 일치하는가?
            const isMatch = apiWord === word;
            
            // 2. 품사가 명사인가? (명사, 대명사, 수사, 의존 명사 등)
            const isNoun = item.pos.includes('명사') || item.pos.includes('대명사') || item.pos.includes('수사');
            
            return isMatch && isNoun;
        });

        if (validItem) {
            console.log(`✅ [한국어] '${word}' 인증 성공!`);
            return { isValid: true, reading: word };
        } else {
            console.log(`❌ [한국어] '${word}'와 정확히 일치하는 명사를 찾지 못함`);
            return { isValid: false };
        }

    } catch (error) { 
        console.error(`🚨 [한국어 통신 에러]`, error.message);
        return { isValid: false }; 
    }
}

// 🇯🇵 일본어 단어 검사 (기존 유지)
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
            const rawReading = foundJa.reading || foundJa.word;
            const reading = toHiragana(cleanString(rawReading, 'ja'));
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) { return { isValid: true, reading: word }; }
}

module.exports = { checkWordExists, fetchRandomWord };