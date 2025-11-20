const axios = require('axios');

async function translateWord(text, sourceLang, targetLang) {
    const langPair = `${sourceLang}|${targetLang}`;
    const apiUrl = 'https://api.mymemory.translated.net/get';

    try {
        const response = await axios.get(apiUrl, {
            params: { q: text, langpair: langPair }
        });
        return response.data.responseData.translatedText || text;
    } catch (error) {
        console.error('번역 실패:', error.message);
        return text; // 실패 시 원본 반환
    }
}

module.exports = { translateWord };