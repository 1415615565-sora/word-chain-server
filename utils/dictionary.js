const axios = require('axios');
const https = require('https');

// 🔑 사용자님 API 키
const NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

// SSL 인증서 에러 무시 (공공기관 접속용)
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// 랜덤 단어 시드
const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す'];

/**
 * 🧹 문자열 청소 (특수문자 제거)
 * "자전거-1" -> "자전거", "구급^차" -> "구급차"
 */
function cleanString(str) {
    if (!str) return "";
    return str
        .split('(')[0] // 괄호 제거
        .split('-')[0] // 번호 제거
        .replace(/\^/g, '') // 삿갓 기호 제거
        .replace(/~/g, '')  // 물결 제거
        .trim();
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
            // 우리말샘 API 사용
            const url = 'https://opendict.korean.go.kr/api/search';

            const response = await axios.get(url, {
                params: {
                    key: cleanKey,
                    q: seed,
                    req_type: 'json',
                    advanced: 'y',
                    part: 'word',
                    pos: '1', // 명사
                    num: 50,
                    sort: 'popular',
                    method: 'include', // 포함 검색 (결과 많이 가져오기)
                    type1: 'word'
                },
                httpsAgent: httpsAgent,
                timeout: 5000
            });

            if (!response.data || typeof response.data === 'string' || !response.data.channel) return null;

            const items = response.data.channel.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = cleanString(randomItem.word).replace(/[^가-힣]/g, '');
                console.log(`✅ [랜덤] 한국어: ${cleanWord}`);
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
                const word = cleanString(jaData.word || jaData.reading);
                const reading = toHiragana(cleanString(jaData.reading || jaData.word));
                console.log(`✅ [랜덤] 일본어: ${word}`);
                return { word, reading, lang: 'ja' };
            }
        }
    } catch (error) { console.error(`🚨 랜덤 단어 실패: ${error.message}`); }
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

// 🇰🇷 한국어 단어 검사 (안전장치 강화)
async function checkKoreanWord(word) {
    // 입력 단어 청소 (공백, 특수문자 제거)
    const cleanInput = cleanString(word).replace(/[^가-힣]/g, '');
    if (cleanInput.length === 0) return { isValid: false };

    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    const url = 'https://opendict.korean.go.kr/api/search';
    
    try {
        const response = await axios.get(url, {
            params: {
                key: cleanKey,
                q: cleanInput,
                req_type: 'json',
                advanced: 'y',
                part: 'word',
                method: 'include', // 포함 검색으로 변경 (데이터 최대한 확보)
                pos: '1',          // 명사
                num: 50            // 50개 가져와서 뒤짐
            },
            httpsAgent: httpsAgent,
            timeout: 5000
        });

        const data = response.data;
        
        // API 에러나 결과 없으면 -> (안전장치) 일단 통과 시킴 (게임 진행 우선)
        // 하지만 결과가 0건('channel.total' <= 0)이면 진짜 없는 단어임
        if (typeof data === 'string' || !data || !data.channel) {
            console.error(`⚠️ API 응답 이상함. 일단 통과 처리.`);
            return { isValid: true, reading: cleanInput };
        }

        if (data.channel.total <= 0) {
            console.log(`❌ [한국어] '${cleanInput}' 사전 검색 결과 0건`);
            return { isValid: false };
        }
        
        // 50개 결과 중에 내 단어랑 '진짜 똑같은 명사'가 있는지 찾기
        const items = data.channel.item;
        const validItem = items.find(item => {
            const apiWord = cleanString(item.word).replace(/[^가-힣]/g, '');
            const isMatch = apiWord === cleanInput;
            // 품사 확인 (명사, 대명사, 수사)
            const isNoun = item.pos.includes('명사') || item.pos.includes('대명사') || item.pos.includes('수사');
            return isMatch && isNoun;
        });

        if (validItem) {
            console.log(`✅ [한국어] '${cleanInput}' 확인 완료!`);
            return { isValid: true, reading: cleanInput };
        } else {
            console.log(`❌ [한국어] '${cleanInput}' 유사 단어는 있지만 정확한 명사 없음`);
            return { isValid: false };
        }

    } catch (error) { 
        console.error(`🚨 [한국어 API 통신 에러] ${error.message} -> 안전하게 통과 처리`);
        // 네트워크 에러 나면 억울하니까 그냥 통과 시킴
        return { isValid: true, reading: cleanInput }; 
    }
}

// 🇯🇵 일본어 단어 검사
async function checkJapaneseWord(word) {
    const cleanInput = cleanString(word); 
    if (cleanInput.length === 0) return { isValid: false };

    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(cleanInput)}`;
    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000 });
        const data = response.data;
        
        if (data.meta.status === 200 && data.data.length > 0) {
            const firstResult = data.data[0];
            
            // 명사 여부 확인 (느슨하게)
            const isNoun = firstResult.senses.some(sense => 
                sense.parts_of_speech.some(pos => 
                    pos.toLowerCase().includes('noun') || 
                    pos.toLowerCase().includes('suru') || 
                    pos.toLowerCase().includes('pronoun')
                )
            );
            
            if (!isNoun) {
                console.log(`❌ [일본어] '${cleanInput}' 명사가 아님`);
                return { isValid: false };
            }
            
            const foundJa = firstResult.japanese[0];
            const rawReading = foundJa.reading || foundJa.word;
            const reading = toHiragana(cleanString(rawReading));
            
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) { 
        console.error(`🚨 [일본어 API 에러] -> 통과 처리`);
        return { isValid: true, reading: cleanInput }; 
    }
}

module.exports = { checkWordExists, fetchRandomWord };