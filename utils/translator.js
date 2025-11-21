const axios = require('axios');
const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

async function translateWord(text, sourceLang, targetLang) {
    // DeepL Free API 전용 주소
    const apiUrl = 'https://api-free.deepl.com/v2/translate';

    // DeepL은 언어 코드를 대문자로 받습니다 (ko -> KO, ja -> JA)
    const targetCode = targetLang.toUpperCase();
    const sourceCode = sourceLang.toUpperCase();

    try {
        const response = await axios.post(apiUrl, {
            text: [text], // 배열 형태로 보냅니다
            target_lang: targetCode,
            source_lang: sourceCode
        }, {
            headers: {
                'Authorization': `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 5000 // 5초 타임아웃
        });

        // 응답 데이터 추출
        if (response.data && response.data.translations && response.data.translations.length > 0) {
            return response.data.translations[0].text;
        }
        
        return text; // 데이터 없음

    } catch (error) {
        // 상세 에러 로그
        if (error.response) {
            // DeepL 서버가 에러를 보낸 경우 (403, 456 등)
            console.error('DeepL API 오류:', error.response.status, error.response.data);
        } else {
            // 네트워크 오류 등
            console.error('DeepL 접속 실패:', error.message);
        }
        return text; // 실패 시 원본 반환 (게임 끊김 방지)
    }
}

module.exports = { translateWord };


module.exports = { translateWord };
