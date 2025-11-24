const axios = require('axios');
const https = require('https');

// 🔑 API 키 (대괄호 제거됨)
const NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

// SSL 에러 방지
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 랜덤 단어용 시드
const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '물', '산', '강', '집', '꿈', '별'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と'];

/**
 * 🧹 문자열 청소 함수 (특수문자 및 괄호 제거)
 * 예: "나무(식물)" -> "나무", "하다-1" -> "하다", "나무^" -> "나무"
 */
function cleanString(str, lang) {
    if (!str) return "";
    
    // 1. 특수기호 뒤쪽은 다 날려버림
    let cleaned = str.split('(')[0].split('^')[0].split('-')[0].split('~')[0];
    
    // 2. 언어별 필터링
    if (lang === 'ko') cleaned = cleaned.replace(/[^가-힣]/g, '');
    else if (lang === 'ja') cleaned = cleaned.replace(/[^\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\u30fc]/g, ''); // 한자+히라+카타+장음
    
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
 * 🎲 랜덤 단어 가져오기 (게임 시작용)
 * 여기는 다양한 단어가 나와야 하므로 'include' 방식을 유지합니다.
 */
async function fetchRandomWord(lang) {
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');

    try {
        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            // 표준국어대사전 URL
            const url = 'https://stdict.korean.go.kr/api/search.do';

            console.log(`📡 [한국어] 랜덤 요청: "${seed}"`);

            const response = await axios.get(url, {
                params: {
                    key: cleanKey,
                    q: seed,
                    req_type: 'json',
                    advanced: 'y',
                    part: 'word',
                    pos: '1', // 명사
                    num: 20,
                    sort: 'popular',
                    method: 'include', // 랜덤은 포함 검색 유지
                    type1: 'word'
                },
                httpsAgent: httpsAgent,
                timeout: 5000
            });

            const data = response.data;
            if (typeof data === 'string') return null; // 에러 시 패스

            const items = data?.channel?.item;
            if (items && items.length > 0) {
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
 * 🧐 통합 검사 함수
 */
async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return { isValid: false };
    if (lang === 'japanese' || lang === 'ja') return await checkJapaneseWord(word);
    if (lang === 'korean' || lang === 'ko') return await checkKoreanWord(word);
    return { isValid: true, reading: word };
}

// 🇰🇷 한국어 단어 검사 (⭐ 원래대로 복구하되 청소 기능 추가)
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    const url = 'https://stdict.korean.go.kr/api/search.do';
    
    try {
        const response = await axios.get(url, {
            params: {
                key: cleanKey,
                q: word,
                req_type: 'json',
                advanced: 'y',
                part: 'word',
                // 🚀 [원상복구] exact(정확 일치)로 변경! 
                // 이제 "기계"를 검색하면 "기계"만 나옵니다. (기계화 같은 거 안 나옴)
                method: 'exact', 
                pos: '1', // 명사
                num: 10 
            },
            httpsAgent: httpsAgent,
            timeout: 5000
        });

        const data = response.data;
        
        // XML 에러 체크
        if (typeof data === 'string') {
            console.error(`⚠️ [한국어 API 에러] ${data.substring(0, 100)}`);
            return { isValid: false };
        }

        if (!data || !data.channel || data.channel.total <= 0) {
            console.log(`❌ [한국어] '${word}' 사전 결과 없음`);
            return { isValid: false };
        }
        
        // 결과 중에서 정확한 명사 찾기
        const validItem = data.channel.item.find(item => {
            // API에서 온 단어를 깨끗하게 씻음 (나무^ -> 나무)
            const apiWord = cleanString(item.word, 'ko');
            
            // 입력 단어와 비교 (둘 다 깨끗한 상태)
            const isMatch = apiWord === word;
            
            // 품사 확인 (명사, 대명사, 수사) - includes로 조금 더 유연하게
            const isNoun = item.pos.includes('명사') || item.pos.includes('대명사') || item.pos.includes('수사');
            
            return isMatch && isNoun;
        });

        if (validItem) {
            console.log(`✅ [한국어] '${word}' 확인 성공!`);
            return { isValid: true, reading: word };
        } else {
            console.log(`❌ [한국어] '${word}'는 사전에 있지만 명사가 아님`);
            return { isValid: false };
        }

    } catch (error) { 
        console.error(`🚨 [한국어 통신 에러]`, error.message);
        return { isValid: false }; 
    }
}

// 🇯🇵 일본어 단어 검사 (기존 유지 + 청소 적용)
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
            // 읽기도 깨끗하게 청소하고 히라가나로 변환
            const reading = toHiragana(cleanString(rawReading, 'ja'));
            
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) { return { isValid: true, reading: word }; }
}

module.exports = { checkWordExists, fetchRandomWord };