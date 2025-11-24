const axios = require('axios');
const https = require('https');

// 🔑 입력해주신 API 키 (대괄호 없이 문자열만 입력)
// 혹시 복사 과정에서 공백이 들어갔을까봐 .trim()과 replace로 안전장치를 걸었습니다.
let NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2';

// SSL 에러 방지
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const KO_SEEDS = ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '물', '산', '강', '밥', '집', '옷', '꽃', '달', '해', '별'];
const JA_SEEDS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き', 'く', 'け', 'こ', 'さ', 'し', 'す', 'せ', 'そ', 'た', 'ち', 'つ', 'て', 'と'];

/**
 * 🎲 랜덤 단어 가져오기
 */
async function fetchRandomWord(lang) {
    // 키 정제 (혹시 모를 대괄호, 공백 제거)
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');

    try {
        if (lang === 'ko') {
            const seed = KO_SEEDS[Math.floor(Math.random() * KO_SEEDS.length)];
            const url = 'https://stdict.korean.go.kr/api/search.do';

            console.log(`📡 [한국어] 랜덤 단어 요청: "${seed}" (Key: ${cleanKey.slice(0,4)}...)`);

            const response = await axios.get(url, {
                params: {
                    key: cleanKey,
                    q: seed,
                    req_type: 'json', // JSON 요청
                    advanced: 'y',
                    part: 'word',
                    pos: '1',     // 명사
                    num: 50,      // 50개 조회
                    method: 'include',
                    type1: 'word' // 단어만 검색
                },
                httpsAgent: httpsAgent,
                timeout: 5000
            });

            const data = response.data;

            // 🚨 [에러 진단] 응답이 JSON 객체가 아니라 문자열(XML)로 왔다면 에러임!
            if (typeof data === 'string') {
                console.error(`🚨 [API 오류] 국립국어원 서버 응답이 JSON이 아닙니다.`);
                console.error(`👉 내용 확인: ${data.substring(0, 200)}`); // 에러 내용 출력
                return null;
            }

            const items = data?.channel?.item;
            if (items && items.length > 0) {
                const randomItem = items[Math.floor(Math.random() * items.length)];
                const cleanWord = randomItem.word.replace(/[^가-힣]/g, '');
                console.log(`✅ [한국어] 랜덤 단어 성공: ${cleanWord}`);
                return { word: cleanWord, reading: cleanWord, lang: 'ko' };
            } else {
                console.log(`⚠️ [한국어] "${seed}" 검색 결과가 0건입니다.`);
            }
        } 
        else if (lang === 'ja') {
            // (일본어 로직은 정상 작동 중이므로 그대로 유지)
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
        console.error(`🚨 [랜덤 단어 실패] ${lang} 오류:`, error.message);
    }
    return null;
}

/**
 * (기존) 통합 검사 함수
 */
async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return { isValid: false };
    if (lang === 'japanese' || lang === 'ja') return await checkJapaneseWord(word);
    if (lang === 'korean' || lang === 'ko') return await checkKoreanWord(word);
    return { isValid: true, reading: word };
}

// 일본어 단어 검사 (기존 유지)
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

// 한국어 단어 검사 (키 정제 적용)
async function checkKoreanWord(word) {
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };
    
    // 키 정제
    const cleanKey = NIKL_API_KEY.replace(/[\[\]\s]/g, '');
    const url = 'https://stdict.korean.go.kr/api/search.do';
    
    try {
        const response = await axios.get(url, {
            params: { key: cleanKey, q: word, req_type: 'json', advanced: 'y', part: 'word', method: 'exact' },
            httpsAgent: httpsAgent, timeout: 5000
        });
        const data = response.data;
        
        // 에러 응답 체크
        if (typeof data === 'string') return { isValid: false };

        if (!data || !data.channel || data.channel.total <= 0) return { isValid: false };
        const validItem = data.channel.item.find(item => {
            return item.word.replace(/[^가-힣]/g, '') === word && (item.pos === '명사' || item.pos === '대명사' || item.pos === '수사');
        });
        return validItem ? { isValid: true, reading: word } : { isValid: false };
    } catch (error) { return { isValid: false }; }
}

module.exports = { checkWordExists, fetchRandomWord };