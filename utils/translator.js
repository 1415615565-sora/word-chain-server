const axios = require('axios');

async function translateWord(text, sourceLang, targetLang) {
    // 언어 설정 (ko|ja)
    const langPair = `${sourceLang}|${targetLang}`;
    const apiUrl = 'https://api.mymemory.translated.net/get';

    try {
        const response = await axios.get(apiUrl, {
            params: { 
                q: text, 
                langpair: langPair,
                // 중요: 이메일을 적어야 하루 500단어 제한이 50,000단어로 늘어납니다.
                // 본인의 실제 이메일을 적는 것이 가장 좋습니다.
                de: 'dev@example.com' 
            },
            headers: {
                // 브라우저인 척 속여서 403 차단을 방지합니다.
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            },
            timeout: 3000 // 3초 안에 응답 없으면 무시 (게임 멈춤 방지)
        });

        // API 상태 코드가 200이어도, 실제 번역 성공 여부는 responseStatus로 확인해야 함
        if (response.data.responseStatus !== 200) {
            console.error(`번역 API 내부 오류: ${response.data.responseDetails}`);
            return text; // 번역 실패 시 원본 반환
        }

        return response.data.responseData.translatedText || text;

    } catch (error) {
        console.error('번역 요청 실패:', error.message);
        return text; // 에러 발생 시 원본 반환
    }
}

module.exports = { translateWord };