const axios = require('axios');

const apiUrl = 'https://api.mymemory.translated.net/get';

/**
 * MyMemory API를 호출하여 텍스트를 번역하는 함수
 * @param {string} text - 번역할 텍스트 (예: "사과")
 * @param {string} sourceLang - 원본 언어 코드 (예: "ko")
 * @param {string} targetLang - 대상 언어 코드 (예: "ja")
 * @returns {Promise<string>} 번역된 "텍스트 (예: "りんご")
 */
async function translateWord(text, sourceLang, targetLang) {
    // MyMemory API는 'ko|ja'와 같은 형식의 langpair를 사용합니다.
    const langPair = `${sourceLang}|${targetLang}`;

    try {
        const response = await axios.get(apiUrl, {
            params: {
                q: text,       // 번역할 텍스트
                langpair: langPair, // 언어 쌍
            },
        });

        // API 응답 구조: response.data.responseData.translatedText
        if (response.data && response.data.responseData) {
            return response.data.responseData.translatedText;
        } else {
            // 번역을 찾지 못한 경우 (가끔 빈 문자열을 줄 때가 있음)
            console.warn('MyMemory 번역 결과 없음:', response.data);
            return text; // 번역 실패 시 원본 텍스트를 그대로 반환 (게임 흐름 유지)
        }

    } catch (error) {
        console.error('MyMemory API 오류:', error.message);
        throw new Error('번역에 실패했습니다.');
    }
}

// 이 함수를 다른 파일에서 사용할 수 있도록 export 합니다.
module.exports = { translateWord };