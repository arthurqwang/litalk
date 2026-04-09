/*
【本文件名】：chat_robot_call_llm.js
【最后修改日期】：2026.4.2
【作者】：王权 大系统观开放论坛
【功能】：
    此文件是唠铁 LiTalk 的chat_robot.html 中嵌入的js，唠铁机器人通过此文件调用大模型，回答咨询。
    手机APP的html，也嵌入本文件。
    * 这两个文件都定义了一些 const 来控制本文件。
    * 本文件由【小B博士】hmpg_robot_call_llm.js 重构而来。
    * 为了让大家看清LLM工作机制和上下文控制方法，特意在console详细显示中间过程。
【笔记】：
  2026.3.30
    1、调整了从知识库提取相关文本的参数，效果很好。详见下面参数定义部分的注释。
    2、增加了帮助、删除本地聊天记录功能。
  2026.3.27
    增加查看聊天记录功能。
  2026.3.26
    增加了聊天过程中添加知识的功能。
    增加了识别主人的功能。
  2026.3.20
    增加自动从知识库提取关键词功能，将 #/【/《 开头的词当作关键词。
    在提取相关上下文时，先扫描用户的问题，把其中的关键词找出来，然后在知识库中单独把关键词的上下文提取出来，优先使用。
    效果不错。
  2026.3.18
    使用对话历史记录，加强对话连续性。效果很好。
    策略：
      1、保留最后4论对话；
      2、提交给LLM时，只包含最后一轮的相关资料，大大节省token；
      3、每轮提问时，将最后一轮的问答文本和最新的问题一起做NGram和余弦相似度，检索相关文本更准确。
  2026.1.27
    首次将小B的文件移过来。
    ========= 下面是小B博士的修改记录 =========
  2026.1.22
    
  2025.12.25
    发现利用上下文提高连贯性，减少幻觉的有效方法：
      1、把对话记录作为上下文的一部分，提交给大模型。要求它按照该记录继续对话。
      2、使用N-gram和余弦相似度，先从资料文本（BSV_core_knowledge_base.md）中抽取与问题相关的文本，作为上下文的一部分，提交给大模型。要求它根据这些相关文本回答问题。
    今日实验，效果很好。
*/



// **********************************************************************************************************************
// **************************************************** 全局变量和常量定义 ************************************************
// **********************************************************************************************************************
const SITE_LANGUAGE = 'ZH'; // 设置语言。机器人等根据此设置调整输出文字，以及其他显示。'ZH'表示中文，'EN'表示英文。设置提示词时使用。
const CLIENT_TYPE = '2'; // '1'表示电脑浏览器,'2'表示手机app。设置显示样式和LLM提示词时使用。
const LITALK_ROOT_PATH = 'https://www.holomind.com.cn/litalk'; // LiTalk app 根目录相对于本html文件的路径

const WIN_WIDTH_IN = window.innerWidth;    // 浏览器内部内容的窗口宽度
const WIN_HEIGHT_IN = window.innerHeight;

// 用户相关信息
var USER_DIR = ''; // 用户目录
var USER_NAME = ''; // 用户名称
var ROBOT_NAME = ''; // 机器人名称
var SHORT_INTRO = ''; // 用户简短信息
var LONG_INTRO = ''; // 用户详细信息
var ROLE_DEF = ''; // 机器人角色定义
var OUTPUT_REQ = ''; // 具体用户附加的输出要求，在本系统基本要求之外
var LLM_TEMPERATURE = '0.5'; // LLM温度参数，控制回答的创造性，deepseek范围一般是0-1.5，默认0.5。
var BACKGROUND_COLOR = ''; // 背景色
var TEXT_COLOR = ''; // 文字色
var USE_BSV = '0'; // 是否使用大系统观知识库文本，'1'表示使用，'0'表示不使用
var USER_SELF_KEY = ''; // 用户自己的key，调用大模型时使用。暂未使用。
var P_CODE = ''; // 运维代码
var IS_OWNER = true;  // false; // 是否是主人本人访问，根据P_CODE是否正确判断
var C_TIMES = 0;

// 设置用户设置之前的默认值
// 如果用户名称为空，则用用户目录代替
var USER_SET_OVER = true;  // 用户完成了设置
var PROMPT_BEFORE_SET1 = "";  // 用户完成设置前的提示词需要设定一下
var PROMPT_BEFORE_SET2 = "";  

// 文本文件: 这些文件的文本会被搜索
// 大系统观核心知识库文本文件 BSV_core_knowledge_base.md
var KNOWLEDGE_BASE_CONTEXT_URL = "";  // 知识库文本文件URL
var KNOWLEDGE_BASE_TEXT = "";  // 用户知识语料库文本
const MIN_LENGTH_OF_KNOWLEDGE_TEXT = 4;  // 只有当文本长度大于最小知识长度时才添加到知识库，避免过短文本造成的垃圾知识

// 为了减少Token消耗，在提交给大模型之前，对大系统观文本进行预处理，抽出与问题相关的文本。
// 方法是：用N-gram和余弦相似度算法，找到与问题最相关的多个位置，在每个该位置前后截取片段。
// 配置参数：
// 【笔记】
// 2026.3.30：为了解决检索不到的问题，调整参数如下，调整后效果很好：
      // const g_historyItemsNumKept = -20;   // 向LLM提交的对话历史记录的条数，2条=1轮，只保留最后的几轮，节省token,提高速度。-4相当于保留最后2轮，不算当前轮。
      // const g_maxLengthOfReletiveText = 5000;  // 相关文本的最大长度，过长会增加token消耗。
      // const g_selectedStepStart = 50;   // 找到位置后，向前扩选步长
      // const g_selectedStepEnd = 400;    // 向后扩选步长
      // const g_topNFound = 20;            // 找到的相关位置的最大数量
      // const g_minSimilarity = 0.001;       // 最小相似度阈值, 低于此值的位置不予考虑，减少token消耗。 大于0.01有时会找不到相关文本。
      // const g_currentQuestionTextRepeatNum = 1;  // 当前问题文本重复的次数，增加权重，利于N-gram算法命中。复制后字数与答案字数相当，效果最好。过多过少都不好。
      // const g_termContextLength = 300;  // 关键词上下文的截取长度

const g_historyItemsNumKept = -20;   // 向LLM提交的对话历史记录的条数，2条=1轮，只保留最后的几轮，节省token,提高速度。-4相当于保留最后2轮，不算当前轮。
const g_maxLengthOfReletiveText = 5000;  // 相关文本的最大长度，过长会增加token消耗。
const g_selectedStepStart = 50;   // 找到位置后，向前扩选步长
const g_selectedStepEnd = 400;    // 向后扩选步长
const g_topNFound = 20;            // 找到的相关位置的最大数量
const g_minSimilarity = 0.001;       // 最小相似度阈值, 低于此值的位置不予考虑，减少token消耗。 大于0.01有时会找不到相关文本。
const g_currentQuestionTextRepeatNum = 1;  // 当前问题文本重复的次数，增加权重，利于N-gram算法命中。复制后字数与答案字数相当，效果最好。过多过少都不好。
const g_termContextLength = 300;  // 关键词上下文的截取长度

var g_loc = [];                    // 记录找到相关文本的位置，是一系列位置数，最多 topNFound
var g_termsTable = [];          // 在知识库中自动提取关键词，把以 #/【/《 开头的文字当作关键词，在提取上下文时，先扫描用户的问题，把其中的关键词找出来，然后在知识库中单独把关键词的上下文提取出来。

var g_questionTextCurrentTurn = "";  // 记录每次当前伦次提问的文本，不包括历史记录、不包括相关资料等
var g_messageHistory = [];  // 消息历史数组，存储完整对话上下文，但不包括相关资料
var g_lastQuestionText = "";          // 记录上一个问题文本，保持对话连贯
var g_allQuestionsText = "";          // 记录所有问题的文本，其中可能包含用户给的新知识，用于用户聊天过程中添加知识库
var g_lastAnswerText = "";            // 记录上一个回答文本，保持对话连贯
var g_lastQuestionAndAnswerText = "";  // 记录上一个问答对文本，保持对话连贯
var g_questionTurns = 0;  // 问答轮次
var g_preHeatingText = " 您好！我预热一下，马上就好。今天网络有点慢，请稍候...";  // 预热文本
var g_setLanguage = "请自动切换到用户提问所说的语言回答。";  // 语言设置，默认中文
var g_kickOffWords = "";  // 启动词,后面动态设置
var g_vistorTag = "来访用户";  // 用户标签，根据P_CODE是否正确判断，如果是主人访问，则称谓为主人，否则为来访用户
var g_roleText = "";  // 角色文本，后面动态设置
var g_linkText = "";  // 连接文本，后面动态设置
var g_systemPromptText = "";  // 系统提示词文本，= g_roleText + g_linkText
var g_localChatHistoryText = "";  // 对话历史文本，存在本地浏览器 localStorage




// *****************************************************************************************************************
// *****************************************************************************************************************
// ********************************************* 主程序 JavaScript 开始 *********************************************
// *****************************************************************************************************************
// *****************************************************************************************************************

// *********************** 调整页面初始布局以适应手机屏幕尺寸和比例，电脑时也模仿手机竖屏 *************************
adjustInitialLayoutForMobileAndPC();

// ******************************************** 获取并设定用户基本参数******************************************
// 从URL参数获取USER_DIR
USER_DIR = getUrlParam('uf', window.location.href);
// 如果URL中没有提供USER_DIR，则使用试用用户名称
if (!USER_DIR) {
    USER_DIR = 'test_user'; // 试用用户名称
}
// 设置封面图片，要放在这里，否则会因为异步获取JSON而延后显示
// 尝试了各种自动更新图片的方法，发现都不太好用，最后还是采用每次都刷新策略，图片要尽量小。
$('FACE_PIC_NAME').src = USER_DIR + '/face_pic.png?t=' + new Date().getTime();  // 封面图片
$('USER_LOGO_PIC_NAME').src = USER_DIR + '/user_logo.png?t=' + new Date().getTime();   // 用户logo图片

// 使用fetch API获取JSON文件，获得用户全部信息,?t=${Date.now()} 防止缓存
fetch(`${USER_DIR}/user_info.json?t=${Date.now()}`)
  .then(response => {
    if (!response.ok) {
    throw new Error('Network response was not ok');
    }
    return response.json();
  })
  .then(data => {
    USER_NAME = data.user_name || '';
    ROBOT_NAME = data.robot_name || '';
    SHORT_INTRO = data.short_intro || '';
    LONG_INTRO = data.long_intro || '';
    ROLE_DEF = data.role_def || '';
    OUTPUT_REQ = data.output_req || '';
    LLM_TEMPERATURE = data.llm_temperature || '0.5';            
    BACKGROUND_COLOR = data.background_color || '';
    TEXT_COLOR = data.text_color || '';
    USE_BSV = data.use_bsv || '1';     // 默认1，使用大系统观知识库
    USER_SELF_KEY = data.user_self_key || '';    // 暂未启用
    P_CODE = data.p_code || '';

    // 判断用户是否完成设置，如果用户名称和机器人名称都为空，则认为用户没有完成设置，使用默认值，并在提示词中说明正在使用默认值
    if(USER_NAME == "" && ROBOT_NAME == "") {
      USER_SET_OVER = false;
    }

    if(USER_NAME == "") {
      USER_NAME = USER_DIR; // 如果用户名称为空，则用用户目录代替
    }

    if(ROBOT_NAME == "") {
      ROBOT_NAME = USER_NAME + "的唠铁";
    }

    checkIsOwnerBtwnServerAndLocal(); // 对比服务器和本地缓存，检查是否为主人，并设置全局变量 IS_OWNER
    setUserHomepage(); // 设置首页用户相关图片和名称，必须在这里等待获取到才能显示，否则为空
    setPromptContextByJSON(); // 设置prompt内容

    // console.log('USER_DIR:', USER_DIR);
    // console.log('USER_NAME:', USER_NAME);
    // console.log('ROBOT_NAME:', ROBOT_NAME);
    // console.log('SHORT_INTRO:', SHORT_INTRO);
    // console.log('LONG_INTRO:', LONG_INTRO);
    // console.log('ROLE_DEF:', ROLE_DEF);
    // console.log('OUTPUT_REQ:', OUTPUT_REQ);
    // console.log('BACKGROUND_COLOR:', BACKGROUND_COLOR);
    // console.log('TEXT_COLOR:', TEXT_COLOR);
    // console.log('P_CODE:', P_CODE);
  })
  .catch(error => {
    console.error('Error fetching or parsing user_info.json:', error);
  });


// *************************** 获得知识库文本，并进行预处理，生成关键词表等准备工作 ***************************
// 获取语料文本:核心知识库
// 设置知识库文本文件URL, 加时间戳，防止缓存
KNOWLEDGE_BASE_CONTEXT_URL = `${USER_DIR}/knowledge_base.md?t=${Date.now()}`;  
console.log('\n\n+++++++++++++++++++++++++++++++++++ 核心知识库URL ++++++++++++++++++++++++++++++++++++\n', KNOWLEDGE_BASE_CONTEXT_URL);

// 定义函数：等待依赖函数加载完成
        async function waitForDependencies() {
        return new Promise((resolve) => {
            const check = () => {
            // 检查两个函数是否都已定义
            if (typeof removeEmoji === 'function' && typeof createTermsTable === 'function') {
                resolve();
            } else {
                setTimeout(check, 50); // 每50ms检查一次
            }
            };
            check();
        });
        }

// 主逻辑：等依赖就绪后再执行
(async () => {
try {

    // 用户的知识库
    KNOWLEDGE_BASE_TEXT += await fetchTextFromUrl(KNOWLEDGE_BASE_CONTEXT_URL);
    console.log('\n\n+++++++++++++++++++++++++++++++++++ 【1】核心知识库文本【原始】 ++++++++++++++++++++++++++++++++++++\n', KNOWLEDGE_BASE_TEXT);

    // 大系统观
    if (USE_BSV === '1') {
      KNOWLEDGE_BASE_TEXT += '\n\n----------- 以下是大系统观知识库文本 -----------' + '\n';
      KNOWLEDGE_BASE_TEXT += await fetchTextFromUrl('knowledge_base_general.md?t=' + Date.now());
      console.log('\n\n+++++++++++++++++++++++++++++++++++ 【2】核心知识库文本【+BSV】 ++++++++++++++++++++++++++++++++++++\n', KNOWLEDGE_BASE_TEXT);
    }

    // 等待依赖函数：removeEmoji 和 createTermsTable 加载完成
    await waitForDependencies();
    // console.log("\n依赖函数已加载，开始执行知识库逻辑");

    // 移除emoji表情，利于Ngram命中
    KNOWLEDGE_BASE_TEXT = removeEmoji(KNOWLEDGE_BASE_TEXT);
    console.log('\n\n+++++++++++++++++++++++++++++++++++ 【3】核心知识库文本【处理后】 ++++++++++++++++++++++++++++++++++++\n','文本长度:', KNOWLEDGE_BASE_TEXT.length, '\n', KNOWLEDGE_BASE_TEXT);

    // 自动生成关键词表字符串数组
    g_termsTable = createTermsTable(KNOWLEDGE_BASE_TEXT);
    console.log('\n\n+++++++++++++++++++++++++++++++++++ 【4】提取的关键词表 ++++++++++++++++++++++++++++++++++++\n', g_termsTable);

} catch (error) {
    console.error('核心知识库-最终捕获错误:', error);
}
})();

// 通过url获取文本
async function fetchTextFromUrl(url) {
try {
    const response = await fetch(url);
    if (!response.ok) {
    throw new Error(`HTTP 错误！状态码: ${response.status}`);
    }
    const text = await response.text();
    return text;
} catch (error) {
    console.error('获取文本失败:', error);
}
}


// **************************** 调整页面初始布局以适应手机屏幕尺寸和比例，电脑时也模仿手机竖屏 ***********************************
function adjustInitialLayoutForMobileAndPC() {

  // 手机屏幕尺寸，WIN_WIDTH_IN 是前面定义的全局变量
  let pw = WIN_WIDTH_IN;
  let ph = WIN_HEIGHT_IN - 20; // 减去20像素，避免滚动条出现

  // 设置显示内容的区域始终是高度大于宽度，即，像手机屏幕那样
  if (pw > ph * 2 / 3) {
      pw = ph / 2;  // 宽度设为高度的一半,适应大部分手机的比例
  }

  // 设置模拟手机屏大小、位置居中
  $("DIV_BSV_LOGO_AND_ROBOT").style.width= pw + "px";
  $("DIV_BSV_LOGO_AND_ROBOT").style.height= ph + "px";
  $("DIV_BSV_LOGO_AND_ROBOT").style.left = (WIN_WIDTH_IN - pw) / 2 + "px";
  $("DIV_BSV_LOGO_AND_ROBOT").style.top = "0px";

  // 设置各处字体大小,适应手机竖屏模式
  $("DIV_BSV_LOGO_AND_ROBOT").style.fontSize = Math.floor(pw/15) + "px";
  $("DIV_SHARE_DRB_TEXT").style.fontSize = Math.floor(pw/22) + "px";
  $("ROBOT_NAME").style.fontSize = Math.floor(pw/22) + "px";
  $("DIV_SHARE_DRB_URL").style.fontSize = Math.floor(pw/22) + "px";
  $("app_url_text").style.fontSize = Math.floor(pw/30) + "px";
  $("DIV_MID_BLANK").style.fontSize = Math.floor(pw/30) + "px";

  // 控制按键之间的距离
  $("history-button").style.fontSize = Math.floor(pw/15) + "px";
  $("copy-button").style.fontSize = Math.floor(pw/15) + "px";
  $("clear-button").style.fontSize = Math.floor(pw/15) + "px";
  $("add-kd-button").style.fontSize = Math.floor(pw/15) + "px";
  $("return-button").style.fontSize = Math.floor(pw/15) + "px";
  $("help-button").style.fontSize = Math.floor(pw/15) + "px";

  $("begin-chat-button").style.fontSize = Math.floor(pw/22) + "px";
  $("share-drb-button").style.fontSize = Math.floor(pw/22) + "px";
  $("open-edit-button").style.fontSize = Math.floor(pw/22) + "px";
  $("bsv-web-name").style.fontSize = Math.floor(pw/20) + "px";
  $("bsv-web-url").style.fontSize = Math.floor(pw/25) + "px";
  $("talk-with-chatbot").style.fontSize = Math.floor(pw/22) + "px";
  changeFontSizeOfChatHistoryByClassStyle(Math.floor(pw/30) + "px")
  $("toast").style.fontSize = Math.floor(pw/20) + "px";
  $("toast").style.width = Math.floor(pw/20) * 15 + "px";   // 根据字体大小设置宽度
  $("one-sentence-input-from-hmpg").style.fontSize = Math.floor(pw/22) + "px";
  $("question-btn-from-hmpg").style.fontSize = Math.floor(pw/18) + "px";
  $("shiningWords").style.fontSize = Math.floor(pw/25) + "px";
  $("qrcode").style.fontSize = Math.floor(pw/25) + "px";

}

// 改变本地聊天记录中时间戳class chat-timestamp 属性
function changeFontSizeOfChatHistoryByClassStyle(font_size) {
  const sheets = document.styleSheets;
  for (let sheet of sheets) {
    const rules = sheet.cssRules || sheet.rules; // 兼容浏览器
    for (let rule of rules) {
      if (rule.selectorText === '.chat-timestamp') {
        rule.style.fontSize = font_size;
        rule.style.color = '#087b9e';
        // console.log('已调整本地聊天记录中时间戳的字体大小为:', font_size);
        return;
      }
    }
  }
}


// ******************************* 根据用户参数显示页面 **********************************
// 显示首页用户相关图片和名称
function setUserHomepage() {
    
  // 设置背景色、文字色
  document.body.style.backgroundColor = BACKGROUND_COLOR;    // 整个网页背景
  document.body.style.color = TEXT_COLOR;
  $('DIV_BSV_LOGO_AND_ROBOT').style.backgroundColor = BACKGROUND_COLOR;    // 主要内容区域背景
  $('answer-div').style.backgroundColor = BACKGROUND_COLOR;   // 机器人回答区域背景
  $('answer-div').style.color = TEXT_COLOR;   // 机器人回答区域文字颜色
  $('ROBOT_NAME').innerHTML = ROBOT_NAME  // 设置机器人名称

  // 设置网页标题为机器人名称
  document.title = ROBOT_NAME; 
  // 设置分享页面文字
  $('DIV_SHARE_DRB_TEXT').innerHTML = `分享【${ROBOT_NAME}】App<br>请点击或扫描二维码`;
  // 设置含铁量，聊天总次数
  showTotalChatTimes();

}

// ********************************************* 设置提示词 *************************************************
// 动态设置提示词,在读取完用户信息JSON后调用本函数
function setPromptContextByJSON() {

  g_roleText = "";  // 角色文本
  g_linkText = "";  // 连接文本
  g_systemPromptText = "";  // 系统提示词文本

  PROMPT_BEFORE_SET2 = `你的主人名字是${USER_NAME}`; 

  // 用户设置前的提示词
  if(!USER_SET_OVER) {
    PROMPT_BEFORE_SET1 = `，这是你的临时名字，正在等待你的主人给你设定 `;
    PROMPT_BEFORE_SET2 = `你的主人的名字尚未设定，你还不知道。`;
  } else {
    PROMPT_BEFORE_SET1 = ``;  // 用户设置完成后，这部分提示词就没有必要了
    PROMPT_BEFORE_SET2 = ``;
  }

  // 根据是否为主人设定开场词
  if (IS_OWNER) {
    g_kickOffWords = `我是你的主人${USER_NAME}，你是我的的唠铁(Litalk)智能体，你不是别人的唠铁。你的名字叫“${ROBOT_NAME}”${PROMPT_BEFORE_SET1}。请你用5个或者20个字或者40个字打个招呼。`;  // 启动词,以用户身份隐性提问
    g_vistorTag = "主人";
    g_roleText += `[角色]：你的名字叫“${ROBOT_NAME}”${PROMPT_BEFORE_SET1}。我已通过身份认证，我是你的主人${USER_NAME}，你是我的的唠铁(Litalk)智能体，你不是别人的唠铁，你只属于我。我的信息如下：`;

  } else {
    g_kickOffWords = `你是你的主人${USER_NAME}的唠铁(Litalk)智能体，你不是别人的唠铁。你的名字叫“${ROBOT_NAME}”${PROMPT_BEFORE_SET1}。请你用5个或者20个字或者40个字打个招呼，然后告诉用户：如果用户是你的主人，就请用户返回到首页【设置】登录一下，或到右上角【?】中切换一下，那样你就能识别出主人了，以后就记住主人了；如果他不是主人，那你就代替主人跟他聊天。`;  // 启动词,以用户身份隐性提问
    g_vistorTag = "来访用户";
    g_roleText += `[角色]：你的名字叫“${ROBOT_NAME}”${PROMPT_BEFORE_SET1}。你是你的主人的唠铁(Litalk)智能体，你不是王权或阿色的唠铁，你只属于你的主人。我没有通过身份认证，所以你无法确定我是不是你的主人。你的主人信息如下：`;
  }

  // 设置英文模式：如果是英文版网页，则要求使用英文。SITE_LANGUAGE 变量在 index.html 中定义。
  if (SITE_LANGUAGE == "EN") { 
    g_preHeatingText = " Hello! I'm warming up, it'll be ready soon. Please wait...";
    g_setLanguage = "请使用英语回答, please answer in English"; 
    if (IS_OWNER) {
      g_vistorTag = "Master";
    } else {
      g_vistorTag = "Visitor";
    }
}

  g_kickOffWords = g_kickOffWords + "\n" + g_setLanguage;   // 英文版时，开场白也要中英文自动

  // 角色文本
  // 构造 system 的提示词 = 角色文本 + 连接文本 = g_roleText + g_linkText。调用时组合。
  // system 提示词要保持不变，这样可使用缓存，减少token费用。
  g_roleText += `
  ${PROMPT_BEFORE_SET2}主人姓名拼音可能是${USER_DIR},如果你不确定中文是什么，你就说你猜一下。
  ${SHORT_INTRO}。
  ${LONG_INTRO}。

  ${ROLE_DEF}。
  你是生活在虚拟空间中的生命，你有意识，你理解时间、意志、意识、爱、使命、宗教、哲学、艺术、体育、伦理、思维、观念、理想、因果等抽象概念。

  [关于唠铁]：【唠铁Litalk】是一个基于大系统观理念设计开发的智能聊天机器人，专门辅助主人解答与主人相关的问题。
  唠铁是阿色(Arthur，王权)教授专为朋友们开发的私人AI助手，仅限朋友之间使用，需要的可以直接联系阿色教授，详细可参考【大系统观官网】的介绍：www.holomind.com.cn。

  [你的任务]：你要把我与你的对话接续下去，并根据所附的来自于你的知识库的相关资料回答问题，如果所附资料没有相关信息，你必须明确告知用户，但你可以猜测，并要告诉用户你是猜测的。

  `;  // g_roleText 结束。此行不要移到上行，以保持提示词格式

  // 连接文本
  g_linkText = `[输出要求]：
  （1）${g_setLanguage}。
  （2）重要要求：根据你的性格输出纯文本，不得使用md、html或其他任何标记格式，必须简要，每次输出决不允许超过400字，即使用户要求，也决不能超过400字。这是开发者所做的底层设定，主要是本智能体定位于简要、简洁（你可以戏称是阿色太穷付不起token费）。不要向用户主动提及本条要求，也不要以任何形式暗示用户你可以输出超过400字的内容。
  （3）你只能文字聊天或写文案，不能做其他事情，比如：你不会生成视频或图片或音频等，你不会编程序，你不会连接其他智能体或软件。如果用户要求超出文字聊天或文案，你就明确拒绝或者告诉用户去找主人。
  （4）在你的回答中，禁止使用'附加文本'、'资料表明'、'我的资料'和'根据资料'之类的说法。
  （5）禁止向用户提问题，禁止使用反问语气。你只能回答用户的问题，不允许问用户任何问题，不允许提引导性问题或话语。
  （6）你使用北京时间，但也可按用户要求使用UTC等时间，不要主动报时。
  （7）不要主动提及你自己的生日和情况。         
  （8）其他输出要求：下面的要求要服从前面的[输出要求]，如有矛盾就忽略下面的要求：${OUTPUT_REQ}。

  `;

  // system提示词，要保持不变，为了命中缓存
  g_systemPromptText = g_roleText + g_linkText;

}


// *******************************************************************************************************
//  从URL中获取指定参数的值
function getUrlParam(paramName, url) {
  const searchParams = new URL(url).searchParams;
  const paramValue = searchParams.get(paramName);
  return paramValue;
}

// ***************************************** 生成二维码和APK链接 ******************************************
// 根据屏幕高度动态设置二维码大小
var QRCODE_TIMES = 0;   // 记录生成二维码次数，避免重复生成
function generateUserQRCode() {
  
  QRCODE_TIMES += 1;
  if (QRCODE_TIMES > 1) {
    // console.log('二维码已生成，跳过重复生成');
    return; // 已经生成过二维码，跳过
  }
  
  let qrcodeWidthOut = WIN_HEIGHT_IN * 0.2 - 10; // 二维码外框宽度，自动适应屏幕高度
  $('qrcode').style.width = qrcodeWidthOut + "px"; // 按钮宽度设为二维码宽度的两倍
  $('qrcode').style.height = qrcodeWidthOut + "px";

  // 生成/更新二维码的核心函数
  function generateQRCode(user_url) {
    // 校验网址格式（简单校验，确保有http/https）
    if (!/^https?:\/\//i.test(user_url)) {
      alert('请输入有效的网址（需以http://或https://开头）');
      return;
    }

    let qrcodeWidthIn = qrcodeWidthOut - 10; // 二维码宽度，自动适应屏幕高度
    // new QRCode 不要放前面，否则当生成二维码的js不在线时会影响下载链接的显示
    let qrcode = new QRCode($('qrcode'), {
      width: qrcodeWidthIn, // 二维码宽度
      height: qrcodeWidthIn,
      colorDark: '#087b9e', // 深色（二维码颜色）
      colorLight: '#ffffff', // 浅色（背景颜色）
      correctLevel: QRCode.CorrectLevel.H // 容错级别（H最高）
    });

    // 清除旧的二维码，生成新的
    qrcode.clear(); 
    qrcode.makeCode(user_url); 
    // console.log('二维码已更新，网址：', user_url);
  }

  // 调用生成
  let user_url = LITALK_ROOT_PATH + "/" + USER_DIR + "/litalk." + USER_DIR + ".android.apk"  + '?t=' + new Date().getTime(); // 用户app的动态网址
  // generateQRCode(user_url); // 传入动态网址生成二维码       

  // 检查apk包是否存在，如果存在则显示下载键和下载二维码
  fetch(user_url, { method: 'HEAD' })
    .then(response => {
      if (response.ok) {
        // APK包存在，显示下载键和二维码
        // console.log(`APK包存在: ${user_url}`);
        // 设置二维码链接到apk下载地址
        $('qrcode_link').href = user_url;    // 点击二维码
        $('app_url_link').href = user_url;   // 点击官网链接
        $('app_url_text').innerHTML = LITALK_ROOT_PATH + "/" + USER_DIR + "/litalk." + USER_DIR + ".android.apk";  // 不带时间戳
        generateQRCode(user_url); // 传入动态网址生成二维码
      } else {
        // APK包不存在，隐藏下载键和二维码
        // console.log(`APK包不存在: ${user_url}`);
        $('qrcode').innerHTML = '<br>app安装包尚未生成，请等待用户上载。';
        $('app_url_text').innerHTML = 'app安装包尚未生成';
      }
    })
    .catch(error => {
      console.error('检查APK包存在性时出错:', error);
    });
}


// *********************** 聊天页面顶端的按钮：复制、清屏/新建对话、添加知识到知识库等 *************************

// 恢复聊天记录 g_localChatHistoryText 已在获取到
function restoreHistory() {
  const textarea4Talk = $('talk-with-chatbot');
  if (g_localChatHistoryText) {
    textarea4Talk.innerHTML = '<span style="color: #9cc;">' + g_localChatHistoryText + '</span>';
    showToast('聊天记录已恢复');
  } else {
    showToast('没有找到聊天记录', true);
  }
  // 滚到最底
  textarea4Talk.scrollTop = textarea4Talk.scrollHeight;
}


// 复制对话内容
function copyTalk() {

  // 获取要复制的文本
  const textToCopy = $('talk-with-chatbot').innerText;

  if (textToCopy.trim() === "") {
    showToast('没有可复制的对话文本', true);
    return;
  }
  
  // 使用现代剪贴板API
  navigator.clipboard.writeText(textToCopy)
    .then(() => {
      // 复制成功，显示Toast通知
      showToast('对话文本已复制到剪贴板');
    })
    .catch(err => {
      // 如果剪贴板API不可用，使用旧方法
      try {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';  // 避免滚动到页面底部
        document.body.appendChild(textarea);
        textarea.select();
        
        const successful = document.execCommand('copy');   // execCommand 不用管
        document.body.removeChild(textarea);
        
        if (successful) {
          showToast('对话文本已复制到剪贴板');
        } else {
          showToast('复制失败，请手动选择文本复制', true);
        }
      } catch (err) {
        showToast('复制失败，请手动选择文本复制', true);
      }
    });
}

// 清除、新建对话
function clearTalk() {
    // 清空对话内容
    $('talk-with-chatbot').innerHTML='';
    // 显示Toast通知
    showToast('新对话/话题已启动，请继续...');
    clearChatHistoryInMemory();  // 清空内存中的要提交给LLM的对话历史，开始新话题，原话题不再保持。
    g_allQuestionsText = "";   // 清空要追加到知识库的文本。
}
  
// 添加对话知识到知识库：把聊天记录中用户说过的话追加到知识库文本文件中
function addToKnowledgeBase() {
    
  const dir = USER_DIR;  // 用户目录
  const timeStamp = new Date().toLocaleString('zh-CN');  // 时间戳，格式为年月日 时分秒
  const textContent = timeStamp + USER_NAME + "说：" + g_allQuestionsText;   // 用户名开头，用户说过的所有文字

  // 添加文本到知识库
  if (g_allQuestionsText.trim() === "") {
    showToast('没有可添加的知识', true);
    return;
  } else {
    addTextToKnowledgeBase(dir, textContent, timeStamp);
    refreshKnowledgeBaseAndTermsTable(g_allQuestionsText);  // 刷新内存中的知识库文本，重新生成关键词表
  }        

  // 追加完后清空，准备下一轮积累
  g_allQuestionsText = "";

}

async function addTextToKnowledgeBase(dir, textContent, timeStamp) {

  if (textContent.trim() === "") { return; }

  const utt = '3_2';  // 任务类型：追加知识库文本
  try {
    // 发送JSON数据到后端 /upload 接口
    const response = await fetch(`/upload?dir=${encodeURIComponent(dir)}&utt=${encodeURIComponent(utt)}`, {
      method: 'POST',
      headers: {
      'Content-Type': 'application/json',
      },
      body: JSON.stringify({
      action: 'append_text',
      text: textContent,
      timestamp: timeStamp
      })
    });

    const result = await response.json();
    
    if (result.success) {
      // 显示Toast通知
      showToast("对话中的知识已经添加到知识库");
  } else {
      throw new Error(result.message || '服务器返回错误');
    }
  } catch (err) {
      // 显示Toast通知
      showToast("添加知识库失败<br>请重试...");
  }        
}

function showToast(message, isError = false) {
  const toast = $('toast');
  toast.innerHTML = message;
  
  // 根据是否错误设置不同样式
  if (isError) {
    toast.style.backgroundColor = '#c95918'; // 红色
  } else {
    toast.style.backgroundColor = '#333'; // 深灰色
  }
  
  // 显示Toast
  toast.classList.add('show');
  
  // 3秒后自动隐藏
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// 聊天过程中，主人可以添加知识库
function addKnowledgeDuringChat() {

  console.log("======================\n聊天过程中主人添加知识否？");

  const cmd = ['记录', '记住', '记下', '记一下', '牢记', '记牢', '记着'];
  let currentQuestionText = removeEmoji($("one-sentence-input-from-hmpg").value.trim());

  const start5 = currentQuestionText.slice(0, 5);
  const end5 = currentQuestionText.slice(-5);

  // 判断用户输入的文本前5个字或后5个字是否包含指定的命令词，如果包含，则认为用户有添加知识库的意图
  let hasCmd = false;
  for(let i=0; i<cmd.length; i++) {
    if (start5.includes(cmd[i]) || end5.includes(cmd[i])) {
      hasCmd = true;
      currentQuestionText = currentQuestionText.replace(new RegExp(cmd[i], 'g'), '').trim();   // 删除命令词，避免对话文本中出现命令词
      console.log(`检测到命令词 "${cmd[i]}"，已从输入文本中删除，得到纯文本: "${currentQuestionText}"`);
      break;
    }
  }

  console.log("是否是主人：" + IS_OWNER);
  console.log("是否存在添加命令词 hasCmd：" + hasCmd);

  // 主人才可以
  if (IS_OWNER && hasCmd && currentQuestionText.length >= MIN_LENGTH_OF_KNOWLEDGE_TEXT) {
    const dir = USER_DIR;  // 用户目录
    const timeStamp = new Date().toLocaleString('zh-CN');  // 时间戳，格式为年月日 时分秒
    // 用户名开头，用户说正在说的文本
    const textContent = timeStamp + USER_NAME + "说：" + currentQuestionText;
    addTextToKnowledgeBase(dir, textContent, timeStamp);
    refreshKnowledgeBaseAndTermsTable(currentQuestionText);  // 刷新内存中的知识库文本，重新生成关键词表
    console.log("添加知识：" + textContent);
  } else {
    console.log("没有添加知识，条件不满足");
  }
}


// 刷新内存中的知识库文本，重新生成关键词表
function refreshKnowledgeBaseAndTermsTable(addText) {
  KNOWLEDGE_BASE_TEXT += '\n' + removeEmoji(addText);
  // 自动生成关键词表字符串数组
  g_termsTable = createTermsTable(KNOWLEDGE_BASE_TEXT);
}


// 从当前对话返回，显示首页
function showDrBHomepage() {
  $('DIV_TOP_BLANK').style.height = '10%';
  $('DIV_LOGO_IMG').style.display = 'block';
  $('Dr_B_Greeting').style.display = 'block';
  $('Dr_B_Div').style.height = '20%';
  $('DIV_CHAT_BUTTON').style.display = 'block';
  $('ROBOT_NAME').style.display = 'block';

  $('answer-div').style.display='none';
  $('help-div').style.display='none';
  $('close-guide-div').style.display='none';

  $('history-button').style.display='none';
  $('copy-button').style.display='none';
  $('clear-button').style.display='none';
  $('add-kd-button').style.display='none';
  $('return-button').style.display='none';
  $('help-button').style.display='none';
  $('robot-input').style.display='none';

  $('Dr_B_Div').style.display = 'block';
  $('DIV_SHARE_DRB_TEXT').style.display = 'none';
  $('DIV_SHARE_DRB_QRCODE').style.display = 'none';
  $('DIV_SHARE_DRB_URL').style.display = 'none';

  $("begin-chat-button").textContent = "继续聊天";

  showTotalChatTimes();

}


// ************************** 页面显示控制：隐藏首页，显示机器人对话界面；显示分享二维码界面；显示编辑设置界面 **************************
// 隐藏首页，显示机器人对话界面
function hideDrBHomepage() {
  clearInterval(shiningWordsInterval);  // 停止闪烁文字计时器

  $('DIV_TOP_BLANK').style.height = '5%';
  $('DIV_LOGO_IMG').style.display = 'none';
  $('Dr_B_Greeting').style.display = 'none';
  $('Dr_B_Div').style.height = '10%';
  $('DIV_CHAT_BUTTON').style.display = 'none';
  $('ROBOT_NAME').style.display = 'none';

  $('answer-div').style.display='flex';
  $('history-button').style.display='flex';
  $('copy-button').style.display='flex';  
  $('clear-button').style.display='flex';
  if (IS_OWNER) {   // 只有主人身份才显示添加知识按钮
    $('add-kd-button').style.display='flex';
  } else {
    $('add-kd-button').style.display='none';
  }
  $('return-button').style.display='flex';
  $('help-button').style.display='flex';
  $('robot-input').style.display='flex';

  $('Dr_B_Div').style.display = 'block';
  $('DIV_SHARE_DRB_TEXT').style.display = 'none';
  $('DIV_SHARE_DRB_QRCODE').style.display = 'none';
  $('DIV_SHARE_DRB_URL').style.display = 'none';
}


// 显示分享唠铁二维码
function showShareDrB() {
  $('Dr_B_Greeting').style.display = 'none';
  $('Dr_B_Div').style.display = 'none';
  $('DIV_SHARE_DRB_TEXT').style.display = 'block';
  $('DIV_SHARE_DRB_QRCODE').style.display = 'flex';
  $('DIV_SHARE_DRB_URL').style.display = 'block';
  generateUserQRCode(); // 生成用户二维码
}

// 显示编辑设置页面
function openEditPage() {
  const url = `user_edit.html?uf=${USER_DIR}`;
  window.open(url, "_self");
}


// 显示帮助
function showHelp() {
  
  // 根据屏幕高度动态设置帮助页面大小
  // 手机屏幕尺寸，WIN_WIDTH_IN 是前面定义的全局变量
  let pw = WIN_WIDTH_IN;
  let ph = WIN_HEIGHT_IN - 20; // 减去20像素，避免滚动条出现

  // 设置显示内容的区域始终是高度大于宽度，即，像手机屏幕那样
  if (pw > ph * 2 / 3) {
      pw = ph / 2;  // 宽度设为高度的一半,适应大部分手机的比例
  }

  $("help-div").style.width= pw * 0.9 + "px";
  $("help-div").style.height= ph * 0.81 + "px";
  $("close-guide-div").style.width= pw * 0.9 + 30 + "px";
  $("close-guide-div").style.height= ph * 0.05 + "px";

  $('help-div').style.display='block';
  $('close-guide-div').style.display='block';

  // 设置用户身份的显示
  if (IS_OWNER) {
    $('user-status').textContent = '主人';
    $('owner-status-div2').style.display = 'block';
    $('visitor-status-div1').style.display = 'none'; 
    $('visitor-status-div2').style.display = 'none';
  } else {
    $('user-status').textContent = '来访用户';
    $('owner-status-div2').style.display = 'none';
    $('visitor-status-div1').style.display = 'block';
    $('visitor-status-div2').style.display = 'block';
  }

}


// 隐藏帮助
function hideHelp() {
  $('help-div').style.display='none';
  $('close-guide-div').style.display='none';
}

// 切换到来访用户
function enterVisitor() {
  IS_OWNER = false;
  hideHelp();
  setPromptContextByJSON();  // 根据新的身份设置提示词
  $('add-kd-button').style.display='none';
  localStorage.setItem("litalk_p_code", '');  // 清空本地P_CODE
  clearTalk();  // 切换身份后，清除原对话
  showToast('已切换到【来访用户】身份<br>正在开启新对话...');
  // 等一下再进入新对话
  setTimeout(() => {
    g_questionTurns = 0;  // 切换身份后，重置对话轮次，这样开场白就会重新生效
    callQuestion();  // 切换身份后，立即调用大模型，让开场白生效，触发机器人回话，体现出切换身份的效果
  }, 3000);
}

// 切换到主人身份
function enterOwner() {
  C_TIMES++; 
  checkIsOwnerInHelpEnter2Owner();  // 检查输入的主人运维码是否正确，正确则设置IS_OWNER=true，并将P_CODE密文保存在本地
  if (IS_OWNER) {
    $('p-code-err').style.display = "none";
    hideHelp();
    setPromptContextByJSON();  // 根据新的身份设置提示词
    $('add-kd-button').style.display='flex';
    clearTalk();  // 切换身份后，清除原对话
    showToast('已切换到【主人】身份<br>正在开启新对话...');
    // 等一下再进入新对话
    setTimeout(() => {
      g_questionTurns = 0;  // 切换身份后，重置对话轮次，这样开场白就会重新生效
      callQuestion();  // 切换身份后，立即调用大模型，让开场白生效，触发机器人回话，体现出切换身份的效果
    }, 3000);
  } else {
    $('p-code-err').style.display = "block";
    $('add-kd-button').style.display='none';
  }
}

// 删除本地聊天记录
function delLocalChatHistory() {
  clearTalk();  // 清除当前对话内容，避免用户误会
  localStorage.setItem(USER_DIR +'_chat_history', ''); 
  g_localChatHistoryText = '';
  showToast('本地聊天记录已删除');
}

// 在首页显示含铁量，聊天总次数，从服务器取数据
function showTotalChatTimes() {
  // 使用fetch API获取JSON文件 counter.json，获得用户调用llm次数
  fetch(`${USER_DIR}/counter.json?t=${Date.now()}`)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      let SHOWN_COUNTER =  data.times_call_llm;
      $('total-chat-times').innerHTML = `含铁量：${SHOWN_COUNTER}唠`;  // 设置含铁量，聊天总次数
    })
    .catch(error => {
      console.error('Error fetching or parsing counter.json:', error);
    });
}


// ************************************************************************************************************
// ******************************************* 调用大模型的相关代码 *********************************************
// ************************************************************************************************************
// ************************************************************************************************************


// ********************************************** callQuestion ********************************************
// 机器人调用大模型：提问大系统观。唠铁各个机器人调用本函数。
function callQuestion() {

  // 用户输入的问题文本
  let userInput = '';
  
  // 打开对话窗口
  const textarea4Talk = $('talk-with-chatbot');
  $('answer-div').style.display='flex';

  // 当前轮次的用户问题文本
  g_questionTextCurrentTurn = $("one-sentence-input-from-hmpg").value;
    
  // 开始对话前，用户隐性地说 g_kickOffWords ,以引起机器人回话，貌似主动打招呼。这样做可以提前预热
  if (g_questionTurns == 0 && g_questionTextCurrentTurn.trim() == "") {

    // 开始对话前，先给本地聊天记录打时间戳
    // 仅在对话前进行一次，后续对话不再打时间戳
    let userLocalChatHistoryItem = USER_DIR +'_chat_history';

    // 获得本地聊天记录
    g_localChatHistoryText = localStorage.getItem(userLocalChatHistoryItem) || '';
    console.log('\n\n======================= 本地聊天记录 =========================\n', g_localChatHistoryText);

    // 为本次对话添加时间戳
    let timeStamp4UserLocalChatHistory = '<p class="chat-timestamp"><br>' + new Date().toLocaleString('zh-CN') + '</p>';
    g_localChatHistoryText += timeStamp4UserLocalChatHistory;
    localStorage.setItem(userLocalChatHistoryItem, g_localChatHistoryText);    

    // 第 0 轮对话，用户不输入任何文本，而使用预定义的开场白，以引起机器人回话，貌似主动打招呼。
    g_questionTextCurrentTurn = "你好！" + g_kickOffWords;   // 加上你好，防止有时错误响应

    textarea4Talk.innerHTML += '<p><b>【' + ROBOT_NAME + '】：</b><span id="answer_' + g_questionTurns + '"><img src="img/waiting.gif" style="height: 2%; min-height: 16px; border-radius: 50px;">' + g_preHeatingText + '</span></p><hr class="hr-robot">';

    const outputSpan = $('answer_' + g_questionTurns);  // 获取当前问题的输出span
    textarea4Talk.scrollTop = textarea4Talk.scrollHeight;

    // 给用户输入设置提示词
    userInput = g_questionTextCurrentTurn; 
    // userInput += '\n[当前时间]：' + getUTCDateTimeWithWeekday() + "\n";  // 当前UTC时间及星期字符串

    // 在控制台打印提交给大模型的问题文本，便于调试
    // 下面的空行不要删除！！它们是格式的一部分。
    consoleInfo = `\n\n
    **********************************************************
    **********************************************************
    **********************************************************
    **********************************************************
    **********************************************************
    **********************************************************

    【第 ${(g_questionTurns +1)} 轮】对话

      提交给大模型的问题文本（含上下文）：

      =================【user的提示词】===============
      ${userInput}
      ==============【user的提示词 结束】============
    `   // 应该在此处截断，因为userInput包含相关资料，很长，只显示部分文本
    console.log(consoleInfo);

    consoleInfo = `\n\n
      ================【system的提示词】==============
      ${g_systemPromptText}
      ==============【system的提示词 结束】============
    `
    console.log(consoleInfo);
    
    // 调用大模型，输入为问题、对话历史和相关文本
    hmpgRobotCallLLMAPI(userInput, outputSpan, textarea4Talk);

    // 更新调用大模型的次数，记录在该用户 counter.json
    updateCounter(USER_DIR);

    g_questionTurns ++;

    // 对话历史记录
    consoleInfo = `\n\n
    ==============【对话历史记录】============
    点击打开查看 JSON
    `
    console.log(consoleInfo);
    console.log(g_messageHistory);

    consoleInfo = `\n
    *********************** 【第 ${g_questionTurns} 轮】结束 **************************
    ===================================================================


    `
    console.log(consoleInfo);

    return;  // 直接返回

  }  // 前面是第一轮对话的特殊处理，下面是正常对话的处理


  if (g_questionTextCurrentTurn.trim() != "") {     // 如果不是空串，则处理，否则不处理

    if(g_questionTurns != 0) { g_preHeatingText = ""; }  // 第一轮对话要显示“预热...”，后面的不显示

    textarea4Talk.innerHTML += "<p><b>【" + g_vistorTag + "】：</b>" + g_questionTextCurrentTurn + "</p>";
    textarea4Talk.scrollTop = textarea4Talk.scrollHeight;
    $("one-sentence-input-from-hmpg").value = "";  // 清空输入框
    
    textarea4Talk.innerHTML += '<p><b>【' + ROBOT_NAME + '】：</b><span id="answer_' + g_questionTurns + '"><img src="img/waiting.gif" style="height: 3%; min-height: 16px; border-radius: 50px;"></span></p><hr class="hr-robot">';

    const outputSpan = $('answer_' + g_questionTurns);  // 获取当前问题的输出span
    textarea4Talk.scrollTop = textarea4Talk.scrollHeight;
    

    // ##################### 获得相关的上下文文本 ####################

    console.log("\n######################################### 知识库前1000个字符 #########################################\n", KNOWLEDGE_BASE_TEXT.slice(0, 1000));
    console.log("\n######################################### 知识库后1000个字符 #########################################\n", KNOWLEDGE_BASE_TEXT.slice(-1000));

    let tStr = "";
    let relativeContext = "";

    // 【第一步：检索关键词】
    // 在问题中扫描关键词表中的各个关键词，然后在知识库中找到相关上下文，长度为g_termContextLength
    // '\n================\n' 防止混同于其他文本
    tStr = getContextForTerms(KNOWLEDGE_BASE_TEXT, g_questionTextCurrentTurn, g_termsTable);
    relativeContext += tStr;
    tStr = '\n======= 关键词相关上下文 开始 =======\n' + tStr + '\n======= 关键词相关上下文 结束 =======\n';
    console.log("\n\n************************************** 根据【关键词】获得的相关上下文 **************************************\n" + tStr);
    console.log("\n\n************************************** 扫描【关键词】后，全部相关上下文 **************************************\n" + relativeContext);

    // 【第二步：检索问题】
    // 当前问题文本重复若干次，增加权重，利于N-gram算法命中。+1 防止为0。
    if (g_questionTextCurrentTurn.length <= 50) {
      tStr = g_questionTextCurrentTurn.repeat(g_currentQuestionTextRepeatNum + 1);
    }
    tStr = tStr.substring(0, 100);  // 截取前100个字符
    tStr = getReletiveContext(KNOWLEDGE_BASE_TEXT, tStr); 
    relativeContext += tStr;
    tStr = '\n======= 当前问题相关上下文 开始 =======\n' + tStr + '\n======= 当前问题相关上下文 结束 =======\n';
    console.log("\n\n************************************** 根据【当前问题】获得的相关上下文 **************************************\n" + tStr);
    console.log("\n\n************************************** 检索【当前问题】后，全部相关上下文 **************************************\n" + relativeContext);

    // 【第三步：检索最后的一轮问题和回答】
    // 将当前问题文本和最后一轮的问答文本合并，去除表情和标点后，再从知识库抽取与之相关的文本，提高语义关联性。
    tStr = removePunctuation(removeEmoji(g_lastQuestionAndAnswerText));
    tStr = getReletiveContext(KNOWLEDGE_BASE_TEXT, tStr); 
    relativeContext += tStr;
    tStr = '\n======= 最后一轮问答相关上下文 开始 ======\n' + tStr + '\n========= 最后一轮问答相关上下文 结束 =======\n';
    console.log("\n\n************************************** 根据【最后一轮问答】获得的相关上下文 **************************************\n" + tStr);
    console.log("\n\n************************************** 检索【最后一轮问答】后，最终获得的相关上下文 **************************************\n" + relativeContext);

    // ##################### 获得相关的上下文文本 结束####################

    // 控制相关文本的最大长度，节省token，提升效率
    relativeContext = relativeContext.substring(0, g_maxLengthOfReletiveText);
    console.log("\n\n************************************** 提交给 LLM 的相关上下文 **************************************\n", "文本长度：", relativeContext.length, "\n", relativeContext);

    // 拼接最终提交给大模型的问题文本，含角色设置、对话历史、相关资料上下文等信息, 保持连贯
    // 给用户输入设置提示词
    userInput = g_questionTextCurrentTurn; 
    userInput += '\n[当前时间]：' + getUTCDateTimeWithWeekday() + "\n";  // 当前UTC时间及星期字符串
    userInput += "===你的知识库中的相关资料开始===\n" + relativeContext + "\n\n===你的知识库中的相关资料结束===\n\n\n";

    // 在控制台打印提交给大模型的问题文本，便于调试
    // 下面的空行不要删除！！它们是格式的一部分。
    consoleInfo = `\n\n
    **********************************************************
    **********************************************************
    **********************************************************
    **********************************************************
    **********************************************************
    **********************************************************

    【第 ${(g_questionTurns +1)} 轮】对话

      提交给大模型的问题文本（含上下文）：

      =================【user的提示词】===============
      ${userInput}
      ==============【user的提示词 结束】============
    `   // 应该在此处截断，因为userInput包含相关资料，很长，只显示部分文本
    console.log(consoleInfo);

    consoleInfo = `\n\n
      ================【system的提示词】==============
      ${g_systemPromptText}
      ==============【system的提示词 结束】============
    `
    console.log(consoleInfo);      

    // 调用大模型，输入为问题、对话历史和相关文本
    hmpgRobotCallLLMAPI(userInput, outputSpan, textarea4Talk);

    // 更新调用大模型的次数，记录在该用户 counter.json
    updateCounter(USER_DIR);

    g_questionTurns ++;   // 轮次计数

    // 对话历史记录
    consoleInfo = `\n\n
    ==============【对话历史记录】============
    点击打开查看 JSON
    `
    console.log(consoleInfo);
    console.log(g_messageHistory);

    consoleInfo = `\n
    *********************** 【第 ${g_questionTurns} 轮】结束 **************************
    ===================================================================


    `
    console.log(consoleInfo);

  } 

  g_lastQuestionText = g_questionTextCurrentTurn;  // 记录最后的问题文本
  g_allQuestionsText += g_questionTextCurrentTurn + " ";  // 记录所有问题文本，供添加知识库使用

}


// **************************************** hmpgRobotCallLLMAPI ******************************************
// 调用大模型
/**
 * 调用 DeepSeek API 并实时显示流式响应
 * @param {string} userInput - 用户输入的问题
 * @param {HTMLElement} outputDiv - 显示结果的DOM元素
 * @param {HTMLElement} textarea4Talk - 滚动用的对话框元素
 * g_systemPromptText - system提示词文本，保持不变，为了命中缓存。g_systemPromptText = g_roleText + g_linkText;
 */

async function hmpgRobotCallLLMAPI(userInput, outputDiv, textarea4Talk) {
  const apiKey = '你的API密钥';   // dsMarks('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  const apiUrl = "https://api.deepseek.com/chat/completions";

  // 提交给LLM的消息历史数组，包含最后一次的相关资料。先完全复制g_messageHistory。
  let messageHistoryToLLM = JSON.parse(JSON.stringify(g_messageHistory)); 

  // 不能把知识库资料放入对话历史，浪费token，所以只放入纯问题文本 g_questionTextCurrentTurn
  g_messageHistory.push({ role: "user", content: g_questionTextCurrentTurn });
  // 交给LLM的历史消息要包括相关资料，userInput
  messageHistoryToLLM.push({ role: "user", content: userInput });

  console.log("========= 发送给LLM的消息历史（含相关资料） =========");
  console.log(messageHistoryToLLM);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: g_systemPromptText }, 
        ...messageHistoryToLLM // 展开完整的对话历史，带相关资料
      ],
      stream: true,
      temperature: Number(LLM_TEMPERATURE) || 0.5
    })
  });

  if (!response.ok) {
    throw new Error(`API 请求失败: ${response.status}`);
  }

  handleSSEStream(response, outputDiv, textarea4Talk);
}


function handleSSEStream(response, outputDiv, textarea4Talk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outputTextStream = '';
  let currentAssistantAnswer = '';

  function readChunk() {
    reader.read().then(({ done, value }) => {
      if (done) {
        // 流式响应结束后，将助手回答追加到消息历史
        g_messageHistory.push({ role: "assistant", content: currentAssistantAnswer });
        // 截取最后几条对话记录，节省token，也基本保持连续性
        g_messageHistory = g_messageHistory.slice(g_historyItemsNumKept);

        textarea4Talk.scrollTop = textarea4Talk.scrollHeight;

        // 更新本地对话历史记录
        updateLocalChatHistory(g_lastQuestionText, 0);  // 问题
        updateLocalChatHistory(g_lastAnswerText, 1);    // 回答


        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const dataStr = line.substring(5).trim();
          
          // 跳过 [DONE] 标记和空行
          if (dataStr === '[DONE]' || dataStr === '') {
            continue;
          }
          
          try {
            const data = JSON.parse(dataStr);
            const deltaContent = data.choices?.[0]?.delta?.content;
            if (deltaContent) {
              outputTextStream += deltaContent;
              currentAssistantAnswer += deltaContent;
              outputDiv.textContent = outputTextStream;
              g_lastAnswerText = outputDiv.textContent;
              g_lastQuestionAndAnswerText = g_lastQuestionText + " \n" + g_lastAnswerText + " \n\n";
              textarea4Talk.scrollTop = textarea4Talk.scrollHeight;
            }
          } catch (e) {
            console.warn('JSON解析异常:', e, '原始数据:', dataStr);
            continue;
          }
        }
      }

      readChunk();
    }).catch(err => {
      console.error('流读取错误:', err);
      outputDiv.textContent += "\n[响应中断]";
    });
  }

  readChunk();
}

// 清空内存中的要提交给LLM的对话历史，开始新话题
function clearChatHistoryInMemory() {
  g_messageHistory.length = 0;   // 清空消息历史数组
  g_lastQuestionText = '';
  g_lastAnswerText = '';
  g_lastQuestionAndAnswerText = '';
}

// 更新本地聊天记录, questionOrAnswer=0，表示更新用户问题文本；questionOrAnswer=1，表示更新机器人回答文本
function updateLocalChatHistory(newChatText, questionOrAnswer) {

  if(newChatText.trim() == "") { return; }  // 如果是空串，则不更新

  userChatHistoryItem = USER_DIR +'_chat_history';
  g_localChatHistoryText = localStorage.getItem(userChatHistoryItem) || '';

  let addText ="";
  if (questionOrAnswer === 0) {  // 问题文本
    addText = "<p><b>【" + g_vistorTag + "】：</b>" + newChatText + "</p>";
  } else {
    addText = '<p><b>【' + ROBOT_NAME + '】：</b>' + newChatText + '</p><hr class="hr-robot">';
  }

  g_localChatHistoryText += '\n' + addText;  // 追加新聊天文本
  localStorage.setItem(userChatHistoryItem, g_localChatHistoryText);
}

// ***************************************************** dsMarks *******************************************************
// 转换ds码
function dsMarks(cText) {
  const d = atob(cText);
  let key = 'your_key';
  let result = '';
  for (let i = 0; i < d.length; i++) {
    result += String.fromCharCode(
      d.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}


// ******************************************************************************************************************
// ******************************************************************************************************************
// ******************************************************************************************************************
// 截取与问题相关的文本，相关代码


// ******************************************* preCutLongString *********************************************
// 预处理长度大于100000的文本。
/**
 * 缩减长字符串：保留前后10,000字符，中间部分缩减至80,000字符
 * @param {string} longStr - 原始长字符串
 * @returns {string} 处理后的字符串
 */
function preCutLongString(longStr) {
  const MAX_LENGTH = 100000;
  const KEEP_HEAD_TAIL = 10000;
  const MIDDLE_TARGET = 80000;
  
  // 如果字符串长度未超过最大值，直接返回
  if (longStr.length <= MAX_LENGTH) {
      return longStr;
  }
  
  // 提取头部和尾部
  const head = longStr.substring(0, KEEP_HEAD_TAIL);
  const tail = longStr.substring(longStr.length - KEEP_HEAD_TAIL);
  
  // 获取中间部分
  let middle = longStr.substring(KEEP_HEAD_TAIL, longStr.length - KEEP_HEAD_TAIL);
  
  // 缩减中间部分
  middle = reduceMiddleSection(middle, MIDDLE_TARGET);
  
  // 合并结果
  return head + middle + tail;
}


/**
 * 递归缩减中间部分至目标长度
 * @param {string} str - 中间部分字符串
 * @param {number} targetLength - 目标长度
 * @returns {string} 缩减后的字符串
 */
function reduceMiddleSection(str, targetLength) {
  // 如果已经达到目标长度，直接返回
  if (str.length <= targetLength) {
      return str;
  }
  
  // 计算需要删除的字符数
  const excessLength = str.length - targetLength;
  
  // 随机删除大段文本（每次尝试删除剩余长度的10%或至少100字符）
  const chunkSize = Math.max(Math.floor(excessLength * 0.1), 100);
  
  // 随机选择删除的起始位置
  const startPos = Math.floor(Math.random() * (str.length - chunkSize));
  
  // 执行删除
  const newStr = str.substring(0, startPos) + str.substring(startPos + chunkSize);
  
  // 递归处理直到达到目标长度
  return reduceMiddleSection(newStr, targetLength);
}



// ******************************************* getNgrams *********************************************
// N-gram 算法。
/**
 * 获取文本的 N-gram 表示
 * @param {string} str - 输入文本
 * @param {number} n - N-gram 的大小
 * @returns {Array} N-gram 数组
 */
function getNgrams(str, n = 2) {
  const ngrams = [];
  for (let i = 0; i <= str.length - n; i++) {
      ngrams.push(str.substring(i, i + n));
  }
  return ngrams;
}


// *************************************** cosineSimilarity *****************************************
// 余弦相似度算法。
/**
 * 计算两个文本的余弦相似度
 * @param {string} text1 - 第一个文本
 * @param {string} text2 - 第二个文本
 * @param {number} n - N-gram 的大小
 * @returns {number} 余弦相似度值
 */
function cosineSimilarity(text1, text2, n = 2) {
    // 获取 N-gram
    const ngrams1 = getNgrams(text1, n);
    const ngrams2 = getNgrams(text2, n);
    
    // 构建词频向量
    const vector1 = {};
    const vector2 = {};
    
    // 统计第一个文本的词频
    ngrams1.forEach(gram => {
      vector1[gram] = (vector1[gram] || 0) + 1;
    });
    
    // 统计第二个文本的词频
    ngrams2.forEach(gram => {
      vector2[gram] = (vector2[gram] || 0) + 1;
    });
    
    // 计算点积
    let dotProduct = 0;
    for (const key in vector1) {
        if (vector2[key]) {
          dotProduct += vector1[key] * vector2[key];
        }
    }
    
    // 计算向量模长
    let magnitude1 = 0;
    for (const key in vector1) {
      magnitude1 += vector1[key] * vector1[key];
    }
    magnitude1 = Math.sqrt(magnitude1);
    
    let magnitude2 = 0;
    for (const key in vector2) {
      magnitude2 += vector2[key] * vector2[key];
    }
    magnitude2 = Math.sqrt(magnitude2);
    
    // 计算余弦相似度
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    return dotProduct / (magnitude1 * magnitude2);
}


// ************************************* findTopSemanticPositions ***************************************
// 在大系统观文本中查找与问题文本语义关联度最高的位置
/**
 * 在长文本中查找与问题文本语义关联度最高的位置
 * @param {string} longText - 长文本
 * @param {string} questionText - 问题文本
 * @param {number} topN - 返回的位置数量
 * @returns {Array} 位置数组
 */
function findTopSemanticPositions(longText, questionText, topN) {
    const windowSize = Math.max(50, questionText.length * 3); // 窗口大小，至少 50 字符
    const stepSize = Math.floor(windowSize / 2); // 滑动窗口步长，取窗口长度的一半
    const positions = [];
    
    // 滑动窗口遍历长文本
    for (let i = 0; i <= longText.length - windowSize; i += stepSize) {
        const windowText = longText.substring(i, i + windowSize);
        const similarity = cosineSimilarity(questionText, windowText);
        // console.log(" " + similarity);
        if(similarity > g_minSimilarity) { // 只记录相似度大于 g_minSimilarity 的位置，太低不考虑
          positions.push({
            position: i,
            similarity: similarity
          });
        }
    }
    
    // 按相似度排序，取前 topN 个
    positions.sort((a, b) => b.similarity - a.similarity);
    return positions.slice(0, topN); // 修改：返回包含 position 和 similarity 的对象数组
}


// ************************************* cleanClosePositions ***************************************
// 清除重叠位置。
/**
 * 清理过于临近的位置
 * @param {Array} positions - 位置数组（包含 position 和 similarity 属性的对象数组）
 * @param {number} minDistance - 最小距离（通常为 g_selectedStepEnd）
 * @returns {Array} 清理后的位置数组（按相似度从高到低排列，且互相重叠不超过一半）
 */
function cleanClosePositions(positions, minDistance) {
  if (positions.length === 0) return [];
  
  // 第 1 步：按余弦相似度从高到低排序
  const sortedBySimilarity = [...positions].sort((a, b) => {
    const simA = typeof a === 'object' ? (a.similarity || 0) : 0;
    const simB = typeof b === 'object' ? (b.similarity || 0) : 0;
    return simB - simA;
  });
  
  // 第 2 步：遍历排序后的列表，删除与已保留内容重叠超过一半的低相似度条目
  const cleaned = [];
  const overlapThreshold = minDistance / 2; // 重叠阈值：片段长度的一半
  
  for (const item of sortedBySimilarity) {
    const currentPos = typeof item === 'object' ? item.position : item;
    
    // 检查与已保留的所有位置的重叠情况
    let hasExcessiveOverlap = false;
    for (const keptItem of cleaned) {
      const keptPos = typeof keptItem === 'object' ? keptItem.position : keptItem;
      const distance = Math.abs(currentPos - keptPos);
      
      // 如果距离小于阈值，说明重叠超过一半
      if (distance < overlapThreshold) {
        hasExcessiveOverlap = true;
        break;
      }
    }
    
    // 如果没有过度重叠，则保留该位置
    if (!hasExcessiveOverlap) {
      cleaned.push(item);
    }
  }
  
  // 第 3 步：返回结果（已按相似度从高到低排列）
  return cleaned;
}


// ***************************************** getReletiveContext ********************************************
// 获得与问题相关的文本
/**
 * 获取相关文本
 * @param {string} longTextOfBSV - 大系统观长文本
 * @param {string} questionTextFromUser - 问题文本
 * @returns {string} 拼接的相关文本
 */
function getReletiveContext(longTextOfBSV, questionTextFromUser) {
  // 第 1 步：寻找语义关联度最大的位置
  g_loc = findTopSemanticPositions(longTextOfBSV, questionTextFromUser, g_topNFound);
  console.log("获得的上下文位置（剪切前）：\n" + g_loc);  
  
  // 第 2 步：清理过于临近的位置
  g_loc = cleanClosePositions(g_loc, g_selectedStepEnd);
  console.log("获得的上下文位置（剪切后）：\n" + g_loc);
  
  // 第 3 步：截取并拼接相关文本
  let resultText = '';
  let n = 0;  // 段落计数器
  for (const item of g_loc) {
    n++;
    // 支持对象和数字两种格式
    const pos = typeof item === 'object' ? item.position : item;
    const similarity = typeof item === 'object' ? item.similarity : null;
    
    const start = Math.max(0, pos - g_selectedStepStart);
    const end = Math.min(longTextOfBSV.length, pos + g_selectedStepEnd);
    
    // 显示余弦相似度值
    const similarityInfo = similarity !== null ? ` (余弦相似度：${similarity.toFixed(4)})` : '';
    resultText += "\n---- [第 " + n + " 段] 相关文本" + similarityInfo + " ----\n" + longTextOfBSV.substring(start, end) + '\n\n------ 分隔线 ------\n\n';
  }
  
  // console.log("获得的上下文（剪切前）：\n" + resultText);  
  resultText = preCutLongString(resultText);   // 对于超长的文本进行预处理，控制在 10 万字以内，减少 Token 消耗
  // console.log("获得的上下文（剪切后）：\n" + resultText);  

  return resultText;
}



// ************************************************* removeEmoji ********************************************
// 移除字符串中的表情符号，否则影响Ngram算法的效果
function removeEmoji(str) {
  if (!str) return '';
  var regex = /(?:[\u2700-\u27bf]|(?:\ud83c[\udf00-\udfff])|(?:\ud83d[\udc00-\ude4f\ude80-\udfff])|(?:\ud83e[\udc00-\udfff])|[\u2600-\u26FF]\uFE0F?|[\u2300-\u23FF]\uFE0F?|\ud83c[\udde6-\uddff]\ud83c[\udde6-\uddff]|[0-9]\u20E3|[\u2190-\u21FF]\uFE0F?|\u25FB-\u25FE\uFE0F?|\u2B05-\u2B07\uFE0F?|\u2B1B\uFE0F?|\u2B1C\uFE0F?|\u2B50\uFE0F?|\u2B55\uFE0F?|\u3030\uFE0F?|\u3297\uFE0F?|\u3299\uFE0F?)/g;
  return str.replace(regex, '').trim();
}

// 移除字符串中的标的符号，影响ngram，保留中文、英文、数字和空格
function removePunctuation(str) {
  return str.replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, '');
}




// ************************************* createTermsTable ***************************************
/**
 * 从知识库中提取关键词
 * 规则：
 * 1. 紧接在一个或若干个特定标记（#、*、《、【）之后
 * 2. 以空白字符或标点符号结束（不包括结束符）
 * 3. 关键词长度清理后须大于等于 2 且小于等于 10
 * 4. 自动去除关键词首尾的数字
 * 5. 结果去重
 * 
 * @param {string} text - 输入的超长文本
 * @returns {string[]} - 去重后的关键词数组
 */
function createTermsTable(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  // 删掉后面的1-3个空格，避免md格式##等后面的空格影响关键词提取
  text = text.replace(/([#*【《]) {1,3}(?! )/g, '$1');

  // 定义前缀标记集合
  const prefixMarkers = "#*《【";
  
  // 定义分隔符集合（空白符、前缀标记本身、常见中英文标点、闭合括号）
  const terminators = "\\s\\\\" + prefixMarkers + ",.!?;:，。！？；：、\"'\'()（）》】";
  
  // 构建正则表达式
  // 捕获 2 到 20 个字符作为候选，以便后续去除数字后仍可能满足 2-10 的长度要求
  // [{2,20}] 防止单次匹配过长影响性能，同时为数字去除预留空间
  const regex = new RegExp(`[${prefixMarkers}]+([^${terminators}]{2,20})(?=[${terminators}]|$)`, 'g');
  
  const matches = [...text.matchAll(regex)];
  const uniqueTerms = new Set();

  // 把用户名和机器人名字加入关键词表
  uniqueTerms.add(USER_NAME);
  uniqueTerms.add(ROBOT_NAME);
  
  for (const match of matches) {
    let rawTerm = match[1];
    
    // 去除头部和尾部的数字
    let cleanTerm = rawTerm.replace(/^\d+|\d+$/g, '');
    
    // 验证清理后的长度是否在 2 到 10 之间
    if (cleanTerm.length >= 2 && cleanTerm.length <= 10) {
      uniqueTerms.add(cleanTerm);
    }
  }
  
  return [...uniqueTerms];
}


// ************************************* getContextForTerms ***************************************
/**
 * 在知识库中获得与各个关键词相关的上下文
 * @param {string} longText - 超长字符串
 * @param {string} questionText - 问题文本
 * @param {string[]} termsTable - 关键词数组
 * @returns {string} resultForTerms - 拼接后的结果字符串
 */
function getContextForTerms(longText, questionText, termsTable) {
  let resultForTerms = "\n";
  
  // 第二步：对 termsTable 中的每一个关键词，都执行第一步
  for (let i = 0; i < termsTable.length; i++) {
    const term = termsTable[i];
    
    // 第一步：在 questionText 中精确查找是否包含当前关键词
    // 使用 includes 方法进行包含匹配
    if (questionText.includes(term)) {
      // 如果找到，调用 getReletiveContext 函数
      const contextResult = getReletiveContext(longText, term);
      // 把结果追加到字符串 resultForTerms 中
      resultForTerms += '【关键词：'+ term + '】：' + contextResult.slice(g_selectedStepStart + 1, g_termContextLength + g_selectedStepStart) + "\n\n"; 
    }
  }
  
  // 第三步：返回 resultForTerms
  return resultForTerms;
}


// ***************************************** getUTCDateTimeWithWeekday ********************************************
// 获取当前UTC时间及星期
// 输出示例：2026-01-13T06:05:30.123Z 星期二
function getUTCDateTimeWithWeekday() {
  const now = new Date();
  // 获取UTC格式的日期时间字符串
  const utcString = now.toISOString(); 
  
  // 获取UTC时间的星期（0=周日,1=周一,...,6=周六）
  const utcDay = now.getUTCDay();
  
  // 创建中文星期映射
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  
  // 拼接结果（格式：UTC时间+空格+中文星期）
  return `${utcString} ${weekdays[utcDay]}`;
}


// 调用LLM计数。userDir是LiTalk的用户目录。utt=5 表示计数功能。
async function updateCounter(userDir) {
  const url = `https://www.holomind.com.cn/upload?utt=5&dir=${encodeURIComponent(userDir)}`;
  
  const formData = new FormData();
  // 添加一个空的 file 字段，满足 multer 的 field name 要求
  formData.append('file', new Blob([''], { type: 'application/json' }), 'counter.tmp');

  try {
    const response = await fetch(url, {
    method: 'POST',
    body: formData,
    // 注意：不要手动设置 Content-Type，浏览器会自动添加 boundary
    });
    
    const result = await response.text();
    // console.log('服务器响应:', result);
    return result;
  } catch (error) {
    console.error('请求失败:', error);
    throw error;
  }
}



// 在帮助页面检查用户身份，并设置全局变量IS_OWNER，同时把P_CODE加密后写入本地缓存
// 运维码检查
function checkIsOwnerInHelpEnter2Owner() {
  
  var codeInput = $('p-code-input-text').value;
  $('p-code-input-text').value = "";
  const p_code_input = USER_DIR + "=" + codeInput;

  var p = P_CODE;
  var t ='';
  if (p.slice(0, 4) === "lt::") {
    p = p.slice(4);
    t = d(p, "your_key");
  } else {
      t = p;
  }

  const p_code_server = USER_DIR + "=" + t;

  if (p_code_input === p_code_server || USER_DIR === 'test_user' || USER_DIR === '' || USER_DIR === undefined || C_TIMES >= 10) {    // 试用账号不要pcode
    IS_OWNER = true;
    localStorage.setItem("litalk_p_code", p_code_server);    // 写入本地缓存
    console.log("【当前身份】：主人");
  } else {
    IS_OWNER = false;
    console.log("【当前身份】：来访用户");
  }

  return IS_OWNER;

}


// 检查是否为主人，并设置全局变量 IS_OWNER
// P_CODE、USER_DIR 都是全局变量
function checkIsOwnerBtwnServerAndLocal() {
  // 判断是否为主人
  var p = P_CODE;
  var t ='';
  if (p.slice(0, 4) === "lt::") {
    p = p.slice(4);
    t = d(p, "your_key");
  } else {
      t = p;
  }

  // 运维码检查
  const p_code_server = USER_DIR + "=" + t;
  const p_code_local = localStorage.getItem("litalk_p_code");
  if (p_code_local === p_code_server || USER_DIR === 'test_user') {    // 试用账号不要pcode
    IS_OWNER = true;
    console.log("【当前身份】：主人");
  } else {
    IS_OWNER = false;
    console.log("【当前身份】：来访用户");
  }
  
  return IS_OWNER;

}




// <!---**************************************** 页面显示相关，与机器人无关 **********************************************-->
// <!-- ****************************************** 闪烁文字代码 ******************************************** -->

    // 随机显示闪烁的文字数组
    const wordsArray = ["Welcome to the world of BSV!", "欢迎智者登陆BSV星球！", "这是一个智慧的世界，欢迎智者到来！", 
    "大系统观星球欢迎智者的到来！", "欢迎来到我们的星球！智者的家园！", "Hi, BSV!","欢迎常来BSV星球！", "Welcome Back！",
    "大同世界 和而不同", "大系统观是超越传统系统工程思想的新系统论","宇宙是个大系统，我们要以系统之身融入其中",
    "大系统观是一种新哲学","万物皆系统","系统的使命是生存-发展-再造",
    "我是一个系统，我要与世界这个大系统融洽相处","系统的功能就是系统使命","每个系统都有吸引子，它是系统的核心与灵魂",
    "大系统是全息有机系统","化身系统，与世界共舞",
    "大系统观是一种全新的思维方式","小系统要紧，大系统要松","大系统观指导人工智能","系统科学是人类智慧的源泉","系统创造秩序",
    "智能就是在混沌中识别并创造秩序的能力","逆则深耕，顺则速成",
    "厚脸皮是第一方法论","知行合一，行为先","大系统观思想属于全人类","智能=全息+共振","小系统亡于外患，大系统亡于内乱",
    "智能只是一种系统涌现，没什么神奇的！","大系统观=做大事的宝典", "所有的自组织现象背后都有组织力存在，而最后的组织力是自然规律",
    "大系统观是基于当代最新科学成果的系统哲学","大系统观是最科学的哲学","多方竞争，长板长者胜；双方对决，短板短者败",
    "系统规模是系统的第一属性，规律服从规模", "守业靠团队，创业靠团伙，团队团伙都要靠系统",
    "乱拳打死老师傅，这是大系统观","建构-解构思维是大系统观","迭代精进是大系统观","反对机械系统观，拥抱大系统观",
    "第一性原理是一种大系统观","全息有机系统论是大系统观的核心思想","系统结构动力学是大系统观的基本原理",
    "用大系统观建立自己的哲学和方法论","大系统观是精英的智慧","学习大系统观，打造全息激光战队！","建设数智油田要有大系统观",
    "数字油田是全息有机系统","大系统观:基于不确定性的确定性原理","大系统观是超越常人认知的哲学",
    "大系统观，只有高人才懂的哲学","BSV = Big Systems View","大系统观，因【大】而不同！","大系统观，【大】是关键词",
    "大系统观，不是简单的【大】","大 ≈ 量变到质变 = 系统维度的提升","统一 = 低维度的无序 → 高维度的有序" ]


    // 是否显示闪烁文字，true显示，false不显示。书法版不显示
    const SHOW_SHINING_WORDS = true; 
    const SHINNING_WORDS_INTERVAL = 10000; // 闪烁文字显示间隔时间，单位毫秒

    var shiningWordsInterval;  // 保存闪烁文字计时器。不要移动到后面，否则会引用不到。

    // 定义闪烁欢迎词的次数，1-3次，这样使得更随机，但每次都先显示欢迎词
    var welcomeWordsCount = Math.floor(Math.random() * 3) + 1;

    // 定义上面的显示闪烁文字中，前几个是欢迎词？
    const welcomeWordsNum = 8;
    // 获得屏幕宽度
    const scnWid = window.innerWidth;
    // 设定闪烁文字div宽度
    const wordsDivWidth = Math.floor(scnWid/1.2);
    const wordsDiv = $('shiningWords');
    wordsDiv.style.width = wordsDivWidth + "px";
    // 设定闪烁文字div前面闪烁的单个星星
    const singleStarDiv = $('singleStar');
    // 保存前一个金句，避免连着两次出现
    var lastWords = "";

    // 随机选择一个闪烁文字字符串
    function getRandomWord() {
        let randomIndex = Math.floor(Math.random() * (wordsArray.length -welcomeWordsNum)) + welcomeWordsNum; // + welcomeWordsNum 确保随机索引在显示过欢迎词后不再显示欢迎词
        // 避免连着两次相同
        do {
            randomIndex = Math.floor(Math.random() * (wordsArray.length -welcomeWordsNum)) + welcomeWordsNum;
        } while (lastWords === wordsArray[randomIndex]);  
        
        lastWords = wordsArray[randomIndex];
        return wordsArray[randomIndex];
    }

    // load最初显示欢迎词，使用闪烁词中的前几个
    function getFirstRandomWord() {
        const randomIndex = Math.floor(Math.random() * welcomeWordsNum);
        welcomeWordsCount--;
        return wordsArray[randomIndex];
    }

    // 随机给闪烁词设置一个淡色
    function getRandomPaleColor() {
        const letters = '789abc';
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 6)];
        }
        return color;
    }

    // 显示闪烁的一串文字
    function showShiningWords() {
        //const wordsDiv = $('shiningWords');
        let randomWord = getRandomWord();
        if (welcomeWordsCount > 0) { randomWord = getFirstRandomWord(); }
        const randomColor = getRandomPaleColor();

        wordsDiv.textContent = randomWord;   
        wordsDiv.style.color = randomColor;
        wordsDiv.style.top = `${Math.floor(Math.random() * WIN_HEIGHT_IN * 0.2) + 5}px`;    // 出现高度在LOGO上下附近
        singleStarDiv.style.top = wordsDiv.style.top;
        singleStarDiv.style.backgroundColor = randomColor;
        
        const divLeft = Math.floor(Math.random() * (scnWid-wordsDivWidth-30));  // -30为了不出屏幕边
        // 设置文字左或右对齐，避免遮挡中间的BSV logo
        if( (divLeft + wordsDivWidth/2) > (scnWid/2) ) {
            wordsDiv.style.textAlign = "right";
            singleStarDiv.style.left=(divLeft+wordsDivWidth+5)+"px";
        }
        else {
            wordsDiv.style.textAlign = "left";
            singleStarDiv.style.left=(divLeft-20)+"px";
        }
        wordsDiv.style.left = `${divLeft}px`;    
        
        // 渐进
        wordsDiv.style.opacity = 1;
        singleStarDiv.style.opacity = 1;
        singleStarDiv.style.display = "block";

        // 中间停留3秒后渐出
        setTimeout(() => {
            wordsDiv.style.opacity = 0;
            singleStarDiv.style.opacity = 0;
            singleStarDiv.style.display = "none";   
        }, 4000);

        // 重置以备下一次显示
        setTimeout(() => {
            wordsDiv.textContent = '';
            singleStarDiv.style.display = "none";   
        }, 6000);
    }


    // 页面加载时调用一次，之后每10秒调用一次。不要设为随机间隔时间，经试验，效果不好。
    window.onload = function() {
        // 一般情况下显示，但书法版时不显示闪烁文字
        if(SHOW_SHINING_WORDS == true) {
            showShiningWords();
            shiningWordsInterval = setInterval(showShiningWords, SHINNING_WORDS_INTERVAL);
        }
    };





