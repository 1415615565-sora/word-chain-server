// utils/dictionary.js

const axios = require('axios');

/**
 * 🇯🇵 일본어 단어 확인 (Jisho.org API 사용)
 * 키 필요 없음 / 무료
 */
async function checkJapaneseWord(word) {
    // Jisho API는 한자나 히라가나를 검색하면 결과를 줍니다.
    const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(word)}`;
    
    try {
        const response = await axios.get(url);
        const data = response.data;
        
        // data.data 배열에 검색 결과가 1개라도 있으면 존재하는 단어입니다.
        if (data.meta.status === 200 && data.data.length > 0) {
            return true;
        }
        return false; // 검색 결과 없음
    } catch (error) {
        console.error('일본어 사전 접속 오류:', error.message);
        return true; // 에러 나면 게임 진행을 위해 일단 인정해줌
    }
}

/**
 * 🇰🇷 한국어 단어 확인 (Wiktionary API 사용)
 * 키 필요 없음 / 무료 / 오픈소스
 */
async function checkKoreanWord(word) {
    // 위키낱말사전(한국어) API
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
        
        // 응답 형식: [ "검색어", ["결과1", "결과2"...], ... ]
        // 두 번째 배열(response.data[1])에 결과가 있으면 단어가 있는 것임
        if (response.data && response.data[1] && response.data[1].length > 0) {
            // 검색 결과가 입력한 단어와 정확히 일치하는지 확인
            const foundWord = response.data[1][0];
            if (foundWord.replace(/\s/g, '') === word.replace(/\s/g, '')) {
                return true;
            }
        }
        
        // 위키낱말사전에 없으면 -> 최후의 수단으로 "네이버 사전 검색 결과"를 크롤링하거나
        // 그냥 "한글 2글자 이상이면 통과" 시키는 로직을 넣을 수도 있습니다.
        // 여기서는 위키에 없으면 "없는 단어"로 처리합니다.
        return false;

    } catch (error) {
        console.error('한국어 사전 접속 오류:', error.message);
        return true; // 에러 나면 일단 인정
    }
}

/**
 * 통합 검사 함수
 */
async function checkWordExists(word, lang) {
    if (!word || word.trim().length === 0) return false;

    // 1. 일본어 검사
    if (lang === 'japanese' || lang === 'ja') {
        return await checkJapaneseWord(word);
    }
    
    // 2. 한국어 검사
    if (lang === 'korean' || lang === 'ko') {
        return await checkKoreanWord(word);
    }

    return true; // 그 외 언어는 일단 통과
}

module.exports = { checkWordExists };