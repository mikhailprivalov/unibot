const { Markup } = require('telegraf');
const axios = require('axios');
const { ChainsSingleton, generateAccount: generateUniAccount } = require('unicore');
const EosApi = require('eosjs-api');

const { restoreAccount } = require('./restore');
const {
  mainButtons, backToMainMenu, demoButtons,
} = require('./utils/bot');

const {createChat, makeAdmin, createGroupCall, setDiscussionGroup} = require('./mtproto')

const {
  getHelixParams,
  getUserHelixBalances,
  printHelixWallet,
  transferAction,
  getLiquidBalance,
  getOneUserHelixBalance,
  printWallet,
  printUserBalances,
  withdrawAction,
  printHelixs,
  priorityAction,
  massWithdrawAction,
  printTail,
  getCurrentUserDeposit,
  getCondition,
  exitFromTail,
} = require('./core');

const { sendMessageToUser, sendMessageToAll } = require('./messages');
const {
  printPartners,
  prepareSpreadAction,
  addPromoBudgetAction,
  getPromoBudget,
  hasRequest,
  requestPromoBudgetAction,
  getPartner,
  continueDemo,
} = require('./partners');

const {
  delOrder,
  getMyOrders,
  cancelOrder,
  acceptBuyOrder,
  confirmActiveBuyOrder,
  approveActiveBuyOrder,
  createOrder,
  setDetails,
  getDetails,
  getChildOrders,
} = require('./p2p');

const {
  generateTaskOutput,
  printTasks,
} = require('./tasks');

const {
  printGoalsMenu,
  voteAction,
  createGoal,
  burnNow,
} = require('./goals');

const {
  sellSharesAction,
  printExpirience,
} = require('./shares');

const education = require('./education');

const {
  getUser,
  saveUser,
  addUserHelixBalance,
  delUserHelixBalance,
  getQuiz,
  saveQuiz,
  insertMessage,
  getMessage,
  getUserByResumeChannelId,
  getUnion
} = require('./db');

const { getDecodedParams } = require('./utils/utm');
const { parseTokenString } = require('./utils/tokens');


async function generateAccount(bot, ctx, isAdminUser, ref) {
  const user = ctx.update.message.from;

  const generatedAccount = await generateUniAccount();

  user.eosname = generatedAccount.name;
  user.mnemonic = generatedAccount.mnemonic;
  user.wif = generatedAccount.wif;
  user.pub = generatedAccount.pub;
  user.is_admin = isAdminUser;
  user.ref = ref;

  if (!user.ref) user.ref = '';

  const params = {
    tg_id: ctx.update.message.from.id,
    username: user.eosname,
    active_pub: user.pub,
    owner_pub: user.pub,
    locale: 'ru',
    referer: user.ref, // referer
    callback: 'tg.me',
    type: 'guest',
    meta: {},
  };

  console.log('referer on register: ', params.referer, 'username: ', generatedAccount.name, 'ref: ', ref);
  try {
    const message = await axios.get(
      `${bot.getEnv().REGISTRATOR}/set`,
      {
        params,
      },
    );
    if (message.data) {
      // TODO set partner info
      await saveUser(bot.instanceName, user);
    } else {
      await saveUser(bot.instanceName, user);
      console.error(message);
      ctx.reply('Произошла ошибка при регистрации вашего аккаунта. Попробуйте позже.', Markup.removeKeyboard());
    }
  } catch (e) {
    await saveUser(bot.instanceName, user);
    return user.eosname;
  }

  return user.eosname;
}


async function isAdmin(bot, id) {
  return Number(id) === Number(bot.getEnv().ADMIN_ID);
}


async function checkForExistBCAccount(bot, ctx) {
  const user = ctx.update.message.from.id;
  const exist = await getUser(bot.instanceName, user);

  if (!exist || !exist.eosname) {
    await generateAccount(bot, ctx, false, '');
    return true;
  }

  return true;
}


const quizDefinition = [
  { message: 'start' },
  // { message: 'Как к вам обращаться?' },
  { message: 'Введите название вашего союза:' },  
  // { message: 'Введите цель вашего союза:' },  
  // { message: 'Введите токен бота вашего союза:' },  
];

async function startQuiz(bot, ctx, user) {
  await getQuiz(bot.instanceName, user.id);

  const q = {
    id: user.id,
    current_quiz: 0,
    answers: quizDefinition,
    is_finish: false,
  };

  await saveQuiz(bot.instanceName, user, q);

  // const buttons = [];

  // buttons.push(Markup.button.url('🏫 перейти на сайт', 'https://simply.estate'));
  
  // const request = Markup.keyboard([Markup.button.contactRequest('📱 Поделиться контактом')], { columns: 1 }).resize();
  
  // await ctx.reply('Как можно к вам обращаться?');


  // startQuiz()
  // return ctx.reply('', request);

}

async function nextQuiz(bot, user, ctx) {
  const quiz = await getQuiz(bot.instanceName, user.id);

  let q;

  // eslint-disable-next-line array-callback-return
  quizDefinition.map((el, index) => {
    if (!q && index > quiz.current_quiz) {
      quiz.current_quiz = index;
      q = el;
    }
  });

  if (q) {
    if (q.buttons && q.buttons.length > 0) {
      const buttons = [];

      // eslint-disable-next-line array-callback-return
      q.buttons.map((b) => {
        buttons.push(b);
      });

      await ctx.reply(q.message, Markup.keyboard(buttons, { columns: 2 }).resize());
    } else {
      const clearMenu = Markup.removeKeyboard();

      await ctx.reply(q.message, clearMenu, { reply_markup: { remove_keyboard: true } });
    }

    await saveQuiz(bot.instanceName, user, quiz);
  } else {
    quiz.is_finish = true;
    await saveQuiz(bot.instanceName, user, quiz);

    // const menu = Markup // , "цели", "действия"
    //   .keyboard(['🪙 кошелёк'], { columns: 1 }).resize();

    
    let unionName = quiz.answers[1].answer
    let id = await ctx.reply("Пожалуйста, подождите. Мы регистрируем союз для вас. ")
    
    //TODO создать чат 
    let chatResult = await createChat(bot, user, unionName, "union")

    let goalChatResult = await createChat(bot, user, unionName, "goals")
    
    // let goalResult = await createChat(bot, user, unionName, "goals")
    // console.log("goalResult: ", goalResult)

    // await setDiscussionGroup(bot, parseInt(goalChatResult.chatId), parseInt(goalResult.chatId))    
    

    await ctx.deleteMessage(id.message_id);

    const buttons = [];

    buttons.push(Markup.button.url('🏫 войти', chatResult.link));
    buttons.push(Markup.button.url('🏫 цели', goalResult.link));
    

    const t = 'Союз создан. Пожалуйста, войдите в союз и завершите настройку.';

    await sendMessageToUser(bot, user, { text: t }, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

    //send message to Channel

    
    // console.log("HERE3")
    // const buttons = [];
    // buttons.push(Markup.button.callback('создать союз', `createunion`));
    // buttons.push(Markup.button.callback('список союзов', `listunion`));
    // buttons.push(Markup.button.callback('лента союзов', `newsunion`));
    // Markup.inlineKeyboard(buttons, { columns: 1 }).resize()
        


    // let text = ''
    // text += `Имя организатора: ${quiz.answers[1].answer}, @${user.username}\n`
    // text += `Название: ${quiz.answers[2].answer}\n`
    // text += `Назначение: ${quiz.answers[3].answer}\n`
    // text += `Токен: ${quiz.answers[4].answer}`
    // let id = await sendMessageToUser(bot, {id : bot.getEnv().CV_CHANNEL}, { text: text });
    // await insertMessage(bot.instanceName, user, bot.getEnv().CV_CHANNEL, text, id, 'CV');    
    // user.state = "chat"
    // user.resume_channel_id = id

    
    await saveUser(bot.instanceName, user)  
    
    
  }
}

module.exports.init = async (botModel, bot) => {
  const protocol = bot.getEnv().PROTOCOL.replace('://', '');
  let host = String(bot.getEnv().ENDPOINT);

  let port = protocol === 'https' ? 443 : 80;

  if (host.includes(':')) {
    [host, port] = host.split(':');
    port = Number(port);
  }

  const config = {
    chains: [
      {
        name: 'FLOWER',
        rpcEndpoints: [
          {
            protocol,
            host,
            port,
          },
        ],
        explorerApiUrl: 'https://explorer.samplesite.com',
      },
    ],
    ual: {
      rootChain: 'FLOWER',
    },
    tableCodeConfig: {
      core: 'unicore',
      staker: 'staker',
      p2p: 'p2p',
      reg: 'registrator',
      part: 'part',
    },
  };

  const instance = new ChainsSingleton();
  instance.init(config);

  bot.uni = instance.getRootChain();

  const options = {
    httpEndpoint: bot.getEnv().PROTOCOL + bot.getEnv().ENDPOINT,
    verbose: false, // API logging
    sign: true,
    logger: {
      // Default logging functions
    },
    fetchConfiguration: {},
  };

  bot.eosapi = EosApi(options);

  bot.start(async (ctx) => {
    ctx.update.message.from.params = getDecodedParams(ctx.update.message.text);

    const ref = await ctx.update.message.text.split('/start ')[1] || null;
    let msg2;

    if (ctx.update.message.chat.type === 'private') {
      if (!ctx.update.message.from.is_bot) {
        let user = await getUser(bot.instanceName, ctx.update.message.from.id);

        if (!user) {
          user = ctx.update.message.from;
          user.app = bot.getEnv().APP;
          user.ref = ref

          await saveUser(bot.instanceName, user);

        } else {

          user.resume_chat_id = null
          user.resume_channel_id = null
        }

        if (!user.eosname) {
          user.eosname = await generateAccount(bot, ctx, false, user.ref);
        } 

        await saveUser(bot.instanceName, user)

        const buttons = [];
        buttons.push(Markup.button.callback('🆕 создать союз', `createunion`));
        // buttons.push(Markup.button.callback('каталог союзов', `listunion`));
        // buttons.push(Markup.button.callback('лента союзов', `newsunion`));

        let t = 'Доброе пожаловать в Децентрализованное Автономное Сообщество.\n';
        // Институт:  @intellect_run
        t += `
Инструкции:
Новости:   @dacom_news
Цели:         @dacom_goals
Задания:   @dacom_tasks
Союзы:      @dacom_unions
Советы:     @dacom_soviets
Досуг:        @dacom_fun`

        ctx.reply(t, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());


        // await ctx.reply('Добро пожаловать в Децентрализованное Автономное Сообщество Института Коллективного Разума!');
  
        // await startQuiz(bot, ctx, user);

      }
    } else {
      console.log("ctx.update.message", ctx.update.message)
      let user = await getUser(bot.instanceName, ctx.update.message.from.id);

      let chatId = ctx.message.chat.id
      let userId = ctx.update.message.from.id

      setDiscussionGroup(bot, 659911949, 1713017401, 9184800756685276000)

      // createGroupCall(bot, chatId, userId)
      // ctx.reply("hello world")
      // let res = await makeAdmin(bot, chatId, userId)
    
      //dont have any reactions on public chats
    }
  });


  bot.on('contact', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.message.from.id);
    const quiz = await getQuiz(bot.instanceName, user.id);

    quiz.answers.map((el, index) => {
      if (index === quiz.current_quiz) {
        el.answer = ctx.update.message.contact;
      }
    });

    await saveQuiz(bot.instanceName, user, quiz);
    await nextQuiz(bot, user, ctx);
  });

  async function welcome(bot, ctx){

    let chatId = ctx.message.chat.id
    let userId = ctx.message.new_chat_member.id
    
    console.log("chatId: ", chatId, "userId: ", userId)
    
    let union = await getUnion(bot.instanceName, Math.abs(chatId))
    console.log("UNION: ", union, chatId)
    if (union)
      if (union.ownerId == userId) {
        let res = await makeAdmin(bot, chatId, userId)

        const id = await sendMessageToUser(bot, { id: chatId }, { text: "Привет админу!" });
        console.log("make admin: ", res)

      } else {
        const id = await sendMessageToUser(bot, { id: chatId }, { text: "Привет участнику" });
      
      }
      
  
  };

  bot.on('new_chat_members', async (ctx) => {
    console.log("welcome")
    welcome(bot, ctx)
    
    //TODO set admin rights and publish next instructions 
    //
    //TODO publish instrucitons
    //
    // console.log("NEW CHAT MEMBERS: ", ctx.message.new_chat_members)
  })

  bot.hears('🏫 Об Институте', async (ctx) => {
    await getUser(bot.instanceName, ctx.update.message.from.id);
    await checkForExistBCAccount(bot, ctx);

    ctx.reply('Главный Вход: https://intellect.run');
  });





  bot.hears('🪙 кошелёк', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    if (ctx.update.message.chat.type === 'private') {
      await printWallet(bot, user);
    } 

  });

  function getHashtags(message){
    let tags = []
    let { text } = message;
    let entities = message.entities
    
    if (entities)
      entities.map(el => {
        if (el.type == 'hashtag') {
          tags.push(text.substr(el.offset + 1, el.length))
        }
      })
    return tags

  }

  bot.on('message', async (ctx) => {
    let user = await getUser(bot.instanceName, ctx.update.message.from.id);
    console.log('catch user', user);
    let { text } = ctx.update.message;
    let entities = ctx.update.message.entities
    
    let tags = getHashtags(ctx.update.message)
    
    console.log("message", ctx.update.message)

    
    // entities: [ { offset: 12, length: 5, type: 'hashtag' } ]
    // console.log("message: ", ctx.update.message, ctx.update.message.chat.type)
    
    if (user) {

      if (ctx.update.message.chat.type !== 'private') {//CATCH MESSAGE ON ANY PUBLIC CHAT WHERE BOT IS ADMIN
        //PUBLIC CHAT
        // console.log('tyL: ', ctx.update.message.reply_to_message);


        if (ctx.update.message.reply_to_message) { //Если это ответ на чье-то сообщение
          //получаем из бд сообщение на которое отвечаем
          const msg = await getMessage(bot.instanceName, ctx.update.message.reply_to_message.forward_from_message_id   || ctx.update.message.reply_to_message.message_id);
          
          if (msg && msg.message_id) {
            //отвечаем пользователю в бота, если сообщение находится в БД

            // console.log('resend back to: ', msg);
            
            const id = await sendMessageToUser(bot, { id: msg.id }, { text });
            console.log("message_id: ", id)
            await insertMessage(bot.instanceName, user, user.id, text, id, {chatId: ctx.update.message.chat.id});
          }
        

        } else {
          if (tags.length > 0){
            for (tag of tags) {
              if (tag === 'goal') {

                console.log("GOAL DETECTED:", tag, user)
                
                let goalId = await createGoal(bot, ctx, user, {
                  hostname: "core",
                  title: text,
                  description: "",
                  target: "0.0000 FLOWER",
                  parent_id: 0,
                })
                
                // console.log("goalId", goalId)

                ctx.reply("Цель добавлена", {reply_to_message_id : ctx.update.message.message_id})
                await insertMessage(bot.instanceName, user, user.id, text, ctx.update.message.message_id, 'goal', {goalId, chatId: ctx.update.message.chat.id});

              } else if (tag === 'action') {
                
                console.log("ACTION DETECTED:", tag)

              }
            }

          }
        }
      } else {//Если это диалог пользователя с ботом
        //проверяем не квиз ли

        const quiz = await getQuiz(bot.instanceName, user.id);
        let { text } = ctx.update.message;
        console.log("on else", text)

        if (quiz && !quiz.is_finish) {
          quiz.answers.map((el, index) => {
            if (index === quiz.current_quiz) {
              el.answer = text;
            }
          });

          await saveQuiz(bot.instanceName, user, quiz);
          await nextQuiz(bot, user, ctx);
        } else if (user.state) {

          console.log("message")
          //SEND FROM USER IN BOT TO PUB CHANNEL
          // console.log("\n\non here2")
          if (user.state === 'chat') {
            // console.log("try to send: ", bot.getEnv().CHAT_CHANNEL, 'reply_to: ', user.resume_chat_id)
            
            try{
              const id = await sendMessageToUser(bot, { id: bot.getEnv().CHAT_CHANNEL }, { text }, {reply_to_message_id : user.resume_chat_id});

              await insertMessage(bot.instanceName, user, bot.getEnv().CHAT_CHANNEL, text, id, 'chat');

              await saveUser(bot.instanceName, user);
            } catch(e) {
              // ctx.reply();
            }
            // 
          } 
        } else {
          console.log("message2")
          await insertMessage(bot.instanceName, user, 'user', text);
        }
      }
    } else {
      if (ctx.update.message && ctx.update.message.is_automatic_forward == true && ctx.update.message.sender_chat){
          if (ctx.update.message.sender_chat.id == bot.getEnv().CV_CHANNEL){ //если словили пересылку из прикрепленного канала
            if(ctx.update.message.forward_from_chat.id == bot.getEnv().CV_CHANNEL){ //то нужно запомнить ID сообщения, чтоб отвечать в том же треде
              user = await getUserByResumeChannelId(bot.instanceName, ctx.update.message.forward_from_message_id)

              if (user && !user.resume_chat_id){
                // console.log("catch forwarded messsage to chat: ", ctx.update.message.message_id)
                user.resume_chat_id = ctx.update.message.message_id
                await saveUser(bot.instanceName, user);  
              }
              
            }
          }
        } else { //Или отправляем пользователю ответ в личку если это ответ на резюме пользователя
      }
    }
  });


  bot.action('createunion', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    
    await startQuiz(bot, ctx, user);
    await nextQuiz(bot, user, ctx);
  });


  bot.action('mypartners', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);
    await printPartners(bot, user);
  });

  bot.action('sendtoall', async (ctx) => {
    const user = await getUser(bot.instanceName, ctx.update.callback_query.from.id);

    const isAdminUser = isAdmin(bot, user.id);
    const message = user.message_to_send;

    user.message_to_send = null;

    await saveUser(bot.instanceName, user);

    if (isAdminUser && message) {
      const count = await sendMessageToAll(bot, { text: message });
      await ctx.replyWithHTML(`Отправлено ${count} партнёрам`);
    } else {
      await ctx.replyWithHTML('Недостаточно прав');
    }
  });


  return null;
};
