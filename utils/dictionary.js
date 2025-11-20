const axios = require('axios');

/**
 * 🇯🇵 일본어 단어 및 읽기 확인 (Jisho.org API)
 */
async function checkJapaneseWord(word) {
    // 한글이 섞여있으면 일본어 아님 (바로 탈락)
    if (/[가-힣]/.test(word)) return { isValid: false };

    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    
    try {
        const response = await axios.get(url);
        const data = response.data;
        
        if (data.meta.status === 200 && data.data.length > 0) {
            // 첫 번째 검색 결과 가져오기
            const firstResult = data.data[0];
            const japaneseData = firstResult.japanese[0];

            // 읽기(reading)가 있으면 가져오고, 없으면 원문(word) 사용 (히라가나만 있는 경우)
            let reading = japaneseData.reading || japaneseData.word;
            
            // 입력한 단어와 검색된 단어가 너무 다르면 거절 (선택사항)
            // 여기서는 관대하게 넘어갑니다.

            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) {
        console.error('일본어 사전 접속 오류:', error.message);
        // 에러 시엔 관대하게 처리하되, 읽기는 원문 그대로 반환
        return { isValid: true, reading: word }; 
    }
}

/**
 * 🇰🇷 한국어 단어 확인
 */
async function checkKoreanWord(word) {
    // 일본어(히라가나/가타카나/한자)가 섞여있으면 한국어 아님
    if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(word)) return { isValid: false };

    const url = `https://ko.wiktionary.org/w/api.php`;
    try {
        const response = await axios.get(url, {
            params: {
                action: 'opensearch',
                search: word,
                limit: 1,
                namespace: 0,
                format: 'json'
            }
        });
        
        if (response.data && response.data[1] && response.data[1].length > 0) {
            const foundWord = response.data[1][0];
            if (foundWord.replace(/\s/g, '') === word.replace(/\s/g, '')) {
                // 한국어는 읽는 법이 곧 표기법이므로 reading도 word와 동일
                return { isValid: true, reading: word };
            }
        }
        return { isValid: false };
    } catch (error) {
        return { isValid: true, reading: word };
    }
}

/**
 * 통합 검사 함수 (이제 객체를 반환합니다!)
 * 반환값: { isValid: boolean, reading: string }
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