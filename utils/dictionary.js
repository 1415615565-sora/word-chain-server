const axios = require('axios');

/**
 * 🇯🇵 일본어 단어 및 읽기 확인 (Jisho.org API)
 * 반환값: { isValid: boolean, reading: string }
 */
async function checkJapaneseWord(word) {
    // 한글이 섞여있으면 일본어 아님
    if (/[가-힣]/.test(word)) return { isValid: false };

    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    
    try {
        const response = await axios.get(url, {
            headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
        }
});
        const data = response.data;
        
        if (data.meta.status === 200 && data.data.length > 0) {
            const firstResult = data.data[0];
            const japaneseData = firstResult.japanese[0];

            // 읽기(reading)가 있으면 가져오고, 없으면 원문(word) 사용
            let reading = japaneseData.reading || japaneseData.word;
            return { isValid: true, reading: reading };
        }
        return { isValid: false };
    } catch (error) {
        console.error('일본어 사전 접속 오류:', error.message);
        // 에러 발생 시 게임 진행을 위해 일단 통과 (원문 반환)
        return { isValid: true, reading: word }; 
    }
}

/**
 * 🇰🇷 한국어 단어 확인 (Wiktionary API)
 */
async function checkKoreanWord(word) {
    // 일본어 문자가 섞여있으면 한국어 아님
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
        
        // 결과가 있으면 통과
        if (response.data && response.data[1] && response.data[1].length > 0) {
            const foundWord = response.data[1][0];
            // 공백 제거 후 비교
            if (foundWord.replace(/\s/g, '') === word.replace(/\s/g, '')) {
                return { isValid: true, reading: word };
            }
        }
        return { isValid: false };
    } catch (error) {
        return { isValid: true, reading: word };
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