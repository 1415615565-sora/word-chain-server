const axios = require('axios');
const https = require('https');

// 🔑 [중요] 국립국어원 API 키를 여기에 반드시 넣어야 합니다! (따옴표 안에)
const NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

// 공공기관 사이트 접속 시 SSL 에러 무시 설정 (필수)
const httpsAgent = new https.Agent({  
    rejectUnauthorized: false 
});

const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す'];

/**
 * 🎲 랜덤 단어 가져오기 (디버깅 로그 추가됨)
 */
async function fetchRandomWord(lang) {
    try {
        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            const url = 'https://stdict.korean.go.kr/api/search.do';

            console.log(`📡 [한국어] 랜덤 단어 요청 시작 (검색어: ${seed})`);

            // API 키 체크
            if (!NIKL_API_KEY || NIKL_API_KEY.includes('여기에')) {
                console.error("🚨 [오류] 국립국어원 API 키가 설정되지 않았습니다!");
                return null;
            }

            const response = await axios.get(url, {
                params: {
                    key: NIKL_API_KEY,
                    q: seed,
                    req_type: 'json',
                    advanced: 'y',
                    part: 'word',
                    pos: '1', // 명사
                    num: 20,
                    sort: 'popular',
                    method: 'include'
                },
                httpsAgent: httpsAgent, // SSL 에러 방지
                timeout: 5000
            });

            // 응답 데이터 확인 로그
            // console.log("응답 데이터:", JSON.stringify(response.data).substring(0, 100) + "...");

            const items = response.data?.channel?.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = randomItem.word.replace(/[^가-힣]/g, ''); // 특수문자 제거
                console.log(`✅ [한국어] 랜덤 단어 성공: ${cleanWord}`);
                return { word: cleanWord, reading: cleanWord, lang: 'ko' };
            } else {
                console.log("⚠️ [한국어] 검색 결과가 없습니다.");
            }
        } 
        else if (lang === 'ja') {
            const seed = JA_SEEDS[Math.floor(Math.random() * JA_SEEDS.length)];
            const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(seed)}`;
            
            console.log(`📡 [일본어] 랜덤 단어 요청 시작 (검색어: ${seed})`);

            const response = await axios.get(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36' 
                },
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
                console.log(`✅ [일본어] 랜덤 단어 성공: ${word}(${reading})`);
                return { word, reading, lang: 'ja' };
            } else {
                console.log("⚠️ [일본어] 명사 검색 결과가 없습니다.");
            }
        }
    } catch (error) {
        console.error(`🚨 [랜덤 단어 실패] ${lang} API 오류:`, error.message);
        if (error.response) {
            console.error("   - 상태 코드:", error.response.status);
            console.error("   - 에러 데이터:", error.response.data);
        }
    }
    return null; // 실패 시 null 반환 -> 비상용 단어 사용
}

/**
 * (기존 유지) 통합 검사 함수
 */
async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return { isValid: false };
    if (lang === 'japanese' || lang === 'ja') return await checkJapaneseWord(word);
    if (lang === 'korean' || lang === 'ko') return await checkKoreanWord(word);
    return { isValid: true, reading: word };
}

// (기존 유지) 일본어 단어 검사
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

// (기존 유지) 한국어 단어 검사
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    const url = 'https://stdict.korean.go.kr/api/search.do';
    try {
        const response = await axios.get(url, {
            params: { key: NIKL_API_KEY, q: word, req_type: 'json', advanced: 'y', part: 'word', method: 'exact' },
            httpsAgent: httpsAgent, timeout: 5000
        });
        const data = response.data;
        if (!data || !data.channel || data.channel.total <= 0) return { isValid: false };
        const validItem = data.channel.item.find(item => {
            return item.word.replace(/[^가-힣]/g, '') === word && (item.pos === '명사' || item.pos === '대명사' || item.pos === '수사');
        });
        return validItem ? { isValid: true, reading: word } : { isValid: false };
    } catch (error) { return { isValid: false }; }
}

module.exports = { checkWordExists, fetchRandomWord };