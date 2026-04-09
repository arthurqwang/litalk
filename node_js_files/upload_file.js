/*
【本文件名】：upload_file.js
【版本】：V 0.3
【最后修改日期】：2026.3.26
【作者】：王权 大系统观开放论坛
【功能】：
    网友上传AHMM和唠铁Litalk文件到大系统观网站的node.js程序。
    基础目录： '/www/wwwroot/www.holomind.com.cn'
    * 上载AHMM文件：
      在 upload_ahmm.html?dir=somedir 传到基础目录下面的指定目录。somedir需要在'全部脑图文件'下已经存在。
    *上载Litalk文件：
      可通过 user_edit.html?dir=somedir&utt=1 传到基础目录下面的litalk目录下的指定目录。
    * url参数中，dir指定上传到的目录， utt指定上传任务类型：
      '0':上传AHMM；
      Litalk任务: '1'：头像user_logo.png; '2':封面face_pic.png; 
      '3':知识库文件 knowledge_base.md; '4':APK文件; '5':更新计数器counter.json;
      '3_2':追加文本到knowledge_base.md（前端解析后发送纯文本）
*/

const path = require('path');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const sharp = require('sharp'); 
const app = express();

// ************************************* 上传AHMM和Litalk文件 **********************************

// 基础目录配置
const BASE_DIR = '/www/wwwroot/www.holomind.com.cn';
var UPLOAD_TASK_TYPE = '0';
var INFO_AFTER_UPLOAD = "";

// 上传ahmm后的统一响应模板（保持原样，略...）
const generateResponse4ahmm = (resultInfo, btnText, dir) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>上传AHMM</title> 
  <style>
  body { font-family: 'Segoe UI', sans-serif; background: #f4f6f8; text-align: center; margin: 0; padding: 20px; }
  .wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; box-sizing: border-box; }
  a { text-decoration: none; color: #666666; }
  a:hover { color: #2020d1; }
  button { margin: 5px; padding: 10px 0px; font-size: 24px; width: 350px; height: 60px; border-radius: 15px; background-color: #9fe6bc; color: #333; border: none; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); transition: all 0.3s ease; cursor: pointer; }
  button:hover { box-shadow: 0 6px 8px rgba(0, 0, 0, 0.2); transform: translateY(-2px); background-color: #e0e0e0; }
  </style>
</head>
<body>
<div id="begin" class="wrapper"><div>
  <div style="display: flex; width: 880px; align-items: center; text-align: left;">
    <a href="http://www.holomind.com.cn/" target="_blank" style="display: flex; align-items: center;">
      <img src="https://www.holomind.com.cn/ahmm/upload_ahmm/BSVlogo2.png" alt="BSV" style="height: 24px;">【大系统观开放论坛】
    </a>
  </div>
  <br><br><br>
  <img src="https://www.holomind.com.cn/ahmm/upload_ahmm/icon.png" alt="Icon" style="height: 80px;">
  <h1 style="margin: 0;">上传阿色全息脑图</h1>
  <br>
  <p><span style="font-size: 28px; color: #f00;">${resultInfo}</span></p>
  <p><a href="https://www.holomind.com.cn/ahmm/全部脑图文件/${encodeURIComponent(dir)}/" target="_blank">[查看已上传脑图目录]</a></p>
  <a href="https://www.holomind.com.cn/ahmm/upload_ahmm/upload_ahmm.html?dir=${encodeURIComponent(dir)}"><button type="submit">${btnText}</button></a>
  <br><br><br><br>
  <h3>大系统观及网站宗旨</h3>
  <p>免费开源 自由使用 自由复制 自由分享</p>
</div></div>
</body>
</html>`;

// 上传litalk文件后的统一响应模板
const generateResponse4litalk = (resultInfo, resultInfo2) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>上传LiTalk个人文件</title> 
  <style>
    body { font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif; line-height: 1.6; background: #000; color: #bbb; text-align: center; margin: 0; padding: 20px; }
    .wrapper { display: flex; flex-direction: column; align-items: center; width: 100%; box-sizing: border-box; }
    button { margin: 5px; padding: 10px 0px; font-size: 24px; width: 350px; height: 60px; border-radius: 15px; background-color: #9fe6bc; color: #333; border: none; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); transition: all 0.3s ease; cursor: pointer; }
    button:hover { box-shadow: 0 6px 8px rgba(0, 0, 0, 0.2); transform: translateY(-2px); background-color: #e0e0e0; }
    .card-logo { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid #555; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); }
  </style>
</head>
<body>
<div class="wrapper">
  <div>
    <br><br><br>
    <img src="https://www.holomind.com.cn/litalk/img/litalk_logo.png" style="width: 40%;">
    <h1 style="margin: 0;">${resultInfo}</h1>
    <br>
    ${resultInfo2}
    <br><br>
    上传如未更新，请刷新页面或清除浏览器缓存后再试。
    <br><br><br>
    <button onclick="window.history.go(-2);">返回</button>
  </div>
</div>
</body>
</html>`;

app.use(cors());
// 【关键】JSON解析中间件必须放在路由之前，用于处理 utt=3_2 的文本追加请求
app.use(express.json({ limit: '2mb' }));

// 缩小上传的图片（保持原样）
async function resizeImageIfNeeded(filePath, maxSize) {
  try {
    const metadata = await sharp(filePath).metadata();
    if (metadata.width > maxSize || metadata.height > maxSize) {
      await sharp(filePath)
        .resize(maxSize, maxSize, { fit: 'inside', withoutEnlargement: true })
        .toFile(filePath + '.tmp');
      fs.renameSync(filePath + '.tmp', filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('图片处理失败:', error);
    if (fs.existsSync(filePath + '.tmp')) fs.unlinkSync(filePath + '.tmp');
    return false;
  }
}

// 更新计数器文件（保持原样）
async function updateCounterFile(dir) {
  try {
    const counterPath = path.join(BASE_DIR, 'litalk', dir, 'counter.json');
    let counterData = { times_call_llm: "0", date_time: new Date().toString() };
    if (fs.existsSync(counterPath)) {
      counterData = JSON.parse(fs.readFileSync(counterPath, 'utf-8'));
    }
    const currentCount = parseInt(counterData.times_call_llm) || 0;
    counterData.times_call_llm = String(currentCount + 1);
    counterData.date_time = new Date().toString();
    const targetDir = path.join(BASE_DIR, 'litalk', dir);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(counterPath, JSON.stringify(counterData, null, 4), 'utf-8');
    return { success: true, data: counterData };
  } catch (error) {
    console.error('更新计数器失败:', error);
    return { success: false, error: error.message };
  }
}

// 【新增】追加文本到knowledge_base.md的函数
async function appendTextToKnowledgeBase(dir, textContent) {
  try {
    const targetDir = path.join(BASE_DIR, 'litalk', dir);
    const kbPath = path.join(targetDir, 'knowledge_base.md');
    
    // 确保目录存在
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    
    // 构建追加内容：添加时间戳和分隔符，便于追踪
    const timestamp = new Date().toLocaleString('zh-CN');
    const appendContent = `\n===============\n〖追加于 ${timestamp}〗\n${textContent}\n`;
    
    // 追加写入（如果文件不存在则创建）
    fs.appendFileSync(kbPath, appendContent, 'utf-8');
    
    return {
      success: true,
      message: `成功追加 ${textContent.length} 字符到知识库`,
      path: kbPath
    };
  } catch (error) {
    console.error('追加知识库文本失败:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

// 统一错误处理中间件
app.use((err, req, res, next) => {
  const dir = req.query.dir;
  const utt = req.query.utt;
  UPLOAD_TASK_TYPE = (utt === undefined) ? '0' : utt.trim();

  if (UPLOAD_TASK_TYPE === '0') {
    res.send(generateResponse4ahmm('上传失败！请重试。', '重新上传', dir));
  } else if (UPLOAD_TASK_TYPE === '3_2') {
    // 文本追加任务的JSON错误响应
    res.status(500).json({ success: false, message: '服务器错误: ' + err.message });
  } else {
    res.send(generateResponse4litalk('上传失败！请重试。', dir));
  }
});

// 配置multer（仅用于文件上传任务，'3_2'任务不走此流程）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const utt = req.query.utt;
      UPLOAD_TASK_TYPE = (utt === undefined) ? '0' : utt.trim();
      const dir = (req.query.dir || '').trim();
      
      if (!/^[\w\u4e00-\u9fa5\-()（）]+$/.test(dir)) {
        throw new Error('目录名称包含非法字符');
      }
      const safeDir = path.normalize(dir).replace(/^(\.\.(\/|\\|$))+/, '');
      const targetDir = (UPLOAD_TASK_TYPE === '0') 
        ? path.join(BASE_DIR, "ahmm/全部脑图文件", safeDir)
        : path.join(BASE_DIR, "litalk", safeDir);
      cb(null, targetDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const decodedName = Buffer.from(file.originalname, 'latin1').toString('utf-8');
    const dir = req.query.dir;
    
    switch (UPLOAD_TASK_TYPE) {
      case '0': cb(null, `[${Date.now()}]_${decodedName}`); break;
      case '1': cb(null, `user_logo.png`); INFO_AFTER_UPLOAD = `您的Logo已更换:<br><img src="https://www.holomind.com.cn/litalk/${dir}/user_logo.png?t=${Date.now()}" class="card-logo">`; break;
      case '2': cb(null, `face_pic.png`); INFO_AFTER_UPLOAD = `您的封面已更换:<br><img src="https://www.holomind.com.cn/litalk/${dir}/face_pic.png?t=${Date.now()}" style="width:300px;">`; break;
      case '3': cb(null, `knowledge_base.md`); INFO_AFTER_UPLOAD = `<br>知识库已更新。<br>`; break;
      case '4': cb(null, `litalk.${dir}.android.apk`); INFO_AFTER_UPLOAD = `<br>App安装包已更新。<br>`; break;
      case '5': cb(null, `counter_update_need.tmp`); break;
      default: cb(null, `[${Date.now()}]_${decodedName}`);
    }
  }
});

const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

// 【核心修改】/upload 路由：兼容文件上传和文本追加
app.post('/upload', 
  // 先处理 JSON 请求（utt=3_2 的文本追加）
  (req, res, next) => {
    const utt = req.query.utt;
    // 如果是 3_2 任务且 Content-Type 是 application/json，则跳过 multer，直接处理
    if (utt === '3_2' && req.is('application/json')) {
      handleTextAppend(req, res);
    } else {
      // 其他情况交给 multer 处理文件上传
      next();
    }
  },
  // multer 中间件：处理文件上传任务
  upload.single('file'),
  // 文件上传任务的处理逻辑
  async (req, res) => {
    const dir = req.query.dir;
    const utt = req.query.utt;
    UPLOAD_TASK_TYPE = (utt === undefined) ? '0' : utt.trim();

    if (!req.file && UPLOAD_TASK_TYPE !== '5') {
      if (UPLOAD_TASK_TYPE === '0') {
        return res.send(generateResponse4ahmm('上传失败！请选择有效文件。', '重新上传', dir));
      } else {
        return res.send(generateResponse4litalk('上传失败！请重试。', dir));
      } 
    }

    try {
      if (UPLOAD_TASK_TYPE === '1') {
        await resizeImageIfNeeded(req.file.path, 150);
        INFO_AFTER_UPLOAD = `您的Logo已更换:<br><img src="https://www.holomind.com.cn/litalk/${dir}/user_logo.png?t=${Date.now()}" class="card-logo">`;
      } else if (UPLOAD_TASK_TYPE === '2') {
        await resizeImageIfNeeded(req.file.path, 600);
        INFO_AFTER_UPLOAD = `您的封面已更换:<br><img src="https://www.holomind.com.cn/litalk/${dir}/face_pic.png?t=${Date.now()}" style="width:300px;">`;
      } else if (['3','4','5'].includes(UPLOAD_TASK_TYPE)) {
        if (UPLOAD_TASK_TYPE === '5') {
          const result = await updateCounterFile(dir);
          INFO_AFTER_UPLOAD = result.success 
            ? `<br>计数器已更新：${result.data.times_call_llm}<br>` 
            : `<br>计数器更新失败：${result.error}<br>`;
        } else {
          INFO_AFTER_UPLOAD = `<br>${UPLOAD_TASK_TYPE==='3'?'知识库':'App安装包'}已更新。<br>`;
        }
      }

      if (UPLOAD_TASK_TYPE === '0') {
        res.send(generateResponse4ahmm('上传成功! 请点击下面链接查看：', '继续上传', dir));
      } else {
        res.send(generateResponse4litalk('上传成功!', INFO_AFTER_UPLOAD));
      }
    } catch (error) {
      console.error('上传后处理异常:', error);
      if (UPLOAD_TASK_TYPE === '0') {
        res.send(generateResponse4ahmm('上传成功! 请点击下面链接查看：', '继续上传', dir));
      } else {
        res.send(generateResponse4litalk('上传成功!', INFO_AFTER_UPLOAD));
      }
    }
  }
);

// 【新增】处理文本追加的独立函数（被 /upload 路由调用）
async function handleTextAppend(req, res) {
  const dir = req.query.dir;
  const { action, text, timestamp } = req.body;
  
  // 参数验证
  if (!dir || !text || action !== 'append_text') {
    return res.status(400).json({ 
      success: false, 
      message: '缺少必要参数或action不正确' 
    });
  }
  
  // 安全验证目录名
  if (!/^[\w\u4e00-\u9fa5\-()（）]+$/.test(dir)) {
    return res.status(400).json({ success: false, message: '目录名称包含非法字符' });
  }
  
  // 文本长度限制（防止恶意大文本）
  if (text.length > 500000) { // 500K字符
    return res.status(400).json({ success: false, message: '文本过长，请分段添加（限50万字符）' });
  }
  
  try {
    const result = await appendTextToKnowledgeBase(dir, text);
    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        dir: dir,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({ success: false, message: result.message });
    }
  } catch (error) {
    console.error('文本追加异常:', error);
    res.status(500).json({ success: false, message: '服务器内部错误: ' + error.message });
  }
}

// 保存 Litalk 用户设置的路由（保持原样）
app.post('/save_user_info', (req, res) => {
    try {
        const { userDir, userData } = req.body;
        if (!userDir || !userData) {
            return res.status(400).json({ success: false, message: '缺少必要参数' });
        }
        const safeDirPattern = /^[\w\u4e00-\u9fa5\-()（）]+$/;
        if (!safeDirPattern.test(userDir)) {
            return res.status(400).json({ success: false, message: '目录名称包含非法字符' });
        }
        const normalizedDir = path.normalize(userDir).replace(/^(\.\.(\/|\\|$))+/, '');
        const targetDir = path.join(BASE_DIR, 'litalk', normalizedDir);
        const configPath = path.join(targetDir, 'user_info.json');
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        const configData = { ...userData, updated_at: new Date().toISOString() };
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf-8');
        return res.status(200).json({ success: true, message: '用户设置保存成功', path: configPath });
    } catch (error) {
        console.error('保存用户配置失败:', error);
        return res.status(500).json({ success: false, message: '服务器内部错误: ' + error.message });
    }
});

// 启动服务器
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});