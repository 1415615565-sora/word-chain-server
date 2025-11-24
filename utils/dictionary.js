const axios = require('axios');
const https = require('https');

// 🔑 국립국어원(표준국어대사전) API 키를 여기에 넣으세요
// 마이페이지 -> 인증키 관리에서 복사
const NIKL_API_KEY = '15F65D064F161D386D3FCB9B997802E2'; 

// 공공기관 사이트 접속 시 SSL 인증서 에러를 무시하기 위한 에이전트
const httpsAgent = new https.Agent({  
    rejectUnauthorized: false 
});

async function checkJapaneseWord(word) {
    if (/[가-힣]/.test(word)) return { isValid: false };

    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/110.0.0.0 Safari/537.36' }
        });
        const data = response.data;
        
        if (data.meta.status === 200 && data.data.length > 0) {
            const firstResult = data.data[0];
            
            // 명사(Noun), 대명사(Pronoun), 스루동사(Suru verb) 체크
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

async function checkKoreanWord(word) {
    // 일본어 문자 포함 시 탈락
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };

    const url = 'https://stdict.korean.go.kr/api/search.do';

    try {
        const response = await axios.get(url, {
            params: {
                key: NIKL_API_KEY,
                q: word,
                req_type: 'json',
                advanced: 'y', // 정확한 일치 검색을 위해 고급 검색 켜기
                part: 'word',  // 단어만 검색
                method: 'exact' // 정확히 일치하는 단어만 (필요시 제외 가능)
            },
            httpsAgent: httpsAgent, // SSL 에러 방지
            timeout: 5000
        });

        const data = response.data;

        // 검색 결과가 없으면 채널(channel) 정보가 비어있거나 total이 0임
        if (!data || !data.channel || data.channel.total <= 0) {
            return { isValid: false };
        }

        // 결과 목록(item)을 순회하며 명사인지 확인
        // API 결과 예시: { word: "나무", pos: "명사", ... }
        const items = data.channel.item;
        
        // 하나라도 명사/대명사/수사가 있으면 통과
        const validItem = items.find(item => {
            // 단어에 붙은 특수문자 제거 (예: '나무^' -> '나무')
            const cleanWord = item.word.replace(/[^가-힣]/g, '');
            
            // 입력한 단어와 정확히 같은지 1차 확인
            if (cleanWord !== word) return false;

            // 품사(pos) 확인
            return item.pos === '명사' || item.pos === '대명사' || item.pos === '수사';
        });

        if (validItem) {
            return { isValid: true, reading: word };
        } else {
            console.log(`[한국어] '${word}'은(는) 사전에 있지만 명사가 아닙니다.`);
            return { isValid: false };
        }

    } catch (error) {
        console.error('국립국어원 API 오류:', error.message);
        // API 키가 틀렸거나 서버 오류 시, 게임 진행을 위해 일단 통과시킬지 선택
        // 여기서는 false로 처리하여 키 확인을 유도함
        return { isValid: false }; 
    }
}

/**
 * 통합 검사 함수
 */
async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return { isValid: false };

    if (lang === 'japanese' || lang === 'ja') {
        return await checkJapaneseWord(word);
    }
    
    if (lang === 'korean' || lang === 'ko') {
        return await checkKoreanWord(word);
    }

    return { isValid: true, reading: word };
}

module.exports = { checkWordExists };