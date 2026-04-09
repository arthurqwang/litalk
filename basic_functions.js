/*
【本文件名】：basic_functions.js
【最后修改日期】：2026.3.10
【作者】：王权 大系统观开放论坛
【功能】：
    此文件是唠铁 LiTalk 的基本函数。
【重要】：不要删掉此文件，多个html使用它。
*/

// 处理 P_CODE
function e(text, key) {
    try {
        if (!text || !key) return text;
        let result = '';
        for (let i = 0; i < text.length; i++) {
            result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        const uint8Array = new TextEncoder().encode(result);
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    } catch (e) {
        console.error("Encryption failed:", e);
        return text; 
    }
}

function d(cipher, key) {
    try {
        if (!cipher || !key) return cipher;
        const binary = atob(cipher);
        const uint8Array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            uint8Array[i] = binary.charCodeAt(i);
        }
        let str = new TextDecoder().decode(uint8Array);
        let result = '';
        for (let i = 0; i < str.length; i++) {
            result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
        return result;
    } catch (e) {
        console.error("Decryption failed:", e);
        return cipher;
    }
}