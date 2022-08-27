const { Markup } = require('telegraf');
const eosjsAccountName = require('eosjs-account-name');
const { lazyFetchAllTableInternal } = require('./utils/apiTable');
const { saveUser, getUserByEosName } = require('./db');

async function getVotesCount(bot, hostname, username) {
  let votes = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', username, 'votes');
  votes = votes.filter((el) => el.host === hostname);
  return votes.length;
}

async function fetchGoals(bot, hostname) {
  const goals = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'goals');
  return goals.sort((a, b) => parseFloat(a.votes) - parseFloat(b.votes));
}

async function fetchHost(bot, hostname) {
  const hosts = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'hosts');
  return hosts[0]
}
async function fetchGoal(bot, hostname, goalId) {
  const goals = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'goals', goalId, goalId, 1);
  return goals[0]
}


async function fetchReport(bot, hostname, reportId) {
  const goals = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'reports3', reportId, reportId, 1);
  return goals[0]
}

async function fetchUPower(bot, hostname, username) {
  const goals = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'power3', username, username, 1);
  if (goals[0]) return goals[0].power;
  return 0;
}

async function fetchConditions(bot, hostname) {
  const conditions = await lazyFetchAllTableInternal(bot.eosapi, 'unicore', hostname, 'conditions');
  // eslint-disable-next-line array-callback-return
  conditions.map((cond, index) => {
    if (cond.key_string === 'condaddgoal') {
      conditions[index].value = eosjsAccountName.uint64ToName(cond.value);
    }

    if (cond.key_string === 'condaddtask') {
      conditions[index].value = eosjsAccountName.uint64ToName(cond.value);
    }

    if (cond.key_string === 'condjoinhost') {
      conditions[index].value = eosjsAccountName.uint64ToName(cond.value);
    }
  });

  return conditions;
}

function getGoalMsg(goal) {
  const votes = goal.positive_votes === 0 ? goal.filled_votes : goal.positive_votes;
  const flowerVotes = `${parseFloat(votes / 10000).toFixed(4)} FLOWER`;

  return `${goal.title}\n${goal.description}\n\nСобрано: ${goal.available} из ${goal.target}\nГолоса: ${flowerVotes}\n${goal.status === 'filled' ? 'Голосование завершено' : ''}`;
}

async function disableButtons(bot, ctx, up) {
  let keyboard = ctx.update.callback_query.message.reply_markup.inline_keyboard

  if (up)
    keyboard[0][0].text = "ожидание"
  else 
    keyboard[0][1].text = "ожидание"
  try{
    await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
  } catch(e){
    console.log("error on disable buttons: ", e.message)
  }
}


async function enableReportButtons(bot, ctx, up, hostname, reportId) {
  let keyboard = ctx.update.callback_query.message.reply_markup.inline_keyboard
  report = await fetchReport(bot, hostname, reportId);

  if (up)
    keyboard[0][0].text = `👍 (${report.voters.length})`
  else 
    keyboard[0][1].text = "ожидание"

  try{
    await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });
  } catch(e){
    console.log("error on enable buttons: ", e.message)
  }
}


async function constructGoalMessage(bot, hostname, goal, goalId){
  if (!goal && goalId)
    goal = await fetchGoal(bot, hostname, goalId);
  console.log("GOAL MATCH2: ", goal.id)

  let host = await fetchHost(bot, hostname)
  let total_shares = host.total_shares
  console.log("total_shares: ", total_shares, goal.positive_votes, goal.negative_votes)
  let text = ""
  text += `ЦЕЛЬ: ${goal.id}\n`
  text += `${goal.title}\n\n`
  text += `Одобрена: ${goal.status != 'waiting' ? "🟢" : "🟡"}\n`
  // text += `Постановщик: ${goal.creator}\n`
  // text += `Координатор: ${goal.benefactor}\n`
  text += `Консенсус: ${parseFloat((goal.positive_votes - goal.negative_votes) / total_shares * 100).toFixed(2)}%`
  return text
}


async function constructTaskMessage(bot, hostname, task, taskId){
  let text = ""

  text += `ДЕЙСТВИЕ: \n`
  text += `${task.title}`
  return text
}

async function constructReportMessage(bot, hostname, report, reportId){
  if (!report && reportId)
    report = await fetchReport(bot, hostname, reportId);

  if (report){
    const goal = await fetchGoal(bot, hostname, report.goal_id);

    console.log("total_shares: ", goal.second_circuit_votes, report.positive_votes, report.negative_votes)
    let text = ""
    let bonus
    let votes

    let user = await getUserByEosName(bot.instanceName, report.username)
    let from = (user.username && user.username != "") ? '@' + user.username : report.username
    text += `ОТЧЁТ от ${from}: \n`
    text += `${report.data}\n\n`
    text += `Одобрен: ${report.approved == '1' ? "🟢" : "🟡"}\n`
    text += `Затрачено: ${parseFloat(report.duration_secs / 60).toFixed(0)} мин\n`
    
    if (report.approved){
      // votes = parseFloat((report.positive_votes - report.negative_votes) / (goal.second_circuit_votes == 0 ? 1 : goal.second_circuit_votes  ) * 100).toFixed(2)
      // text += `Голоса: ${}%\n`
      bonus = `${(report.positive_votes - report.negative_votes) /  (goal.second_circuit_votes == 0 ? report.positive_votes : goal.second_circuit_votes  ) * goal.total_power_on_distribution} POWER\n`
      bonus = parseFloat(bonus).toFixed(2) + " POWER"
    } else {
      // votes = parseFloat((report.positive_votes - report.negative_votes) / (goal.second_circuit_votes == 0 ? 1 : goal.second_circuit_votes  ) * 100).toFixed(2)
      
      // text += `Голоса: ${parseFloat((report.positive_votes - report.negative_votes) / (goal.second_circuit_votes == report.positive_votes ? 1 : goal.second_circuit_votes + report.positive_votes  ) * 100).toFixed(2)}%\n`
      if (report.positive_votes == 0){
        bonus = parseFloat(0).toFixed(2) + " POWER"
      } else {
        bonus = `${(report.positive_votes - report.negative_votes) /  (goal.second_circuit_votes  + report.positive_votes ) * (goal.total_power_on_distribution + (parseFloat(report.requested) * 0.1) ) } POWER\n`
      }
      
    }
    
    text += `Подарок: ${report.requested} + ${bonus}\n`
    
    // text += `Бонус: 

    // text += `Постановщик: ${report.creator}\n`
    // text += `Координатор: ${report.benefactor}\n`
    return text  

  } else return null
  
}

async function editGoalMsg(bot, ctx, user, hostname, goalId) {

  const goal = await fetchGoal(bot, hostname, goalId);
  console.log("GOAL MATCH: ", goal.id, goalId)

  let buttons = [];
  buttons.push(Markup.button.callback(`👍 (${goal.positive_votes} POWER)`, `upvote ${hostname} ${goalId}`));
  buttons.push(Markup.button.callback(`👎 (${goal.negative_votes} POWER)`, `downvote ${hostname} ${goalId}`));
  buttons.push(Markup.button.switchToCurrentChat('создать действие', `#task_${goalId} `));
                
  const keyboard = buttons;

  const columnsCount = 2;

  buttons = keyboard.reduce((curr, next, index) => {
    if (index % columnsCount === 0) {
      curr.push([]);
    }

    const [row] = curr.slice(-1);

    row.push(next);

    return curr;
  }, []);

  // let modified = false
  // console.log(ctx.update.callback_query.message.reply_to_message.message_id)
  // await ctx.
  await ctx.editMessageReplyMarkup({ inline_keyboard: buttons });

  console.log(ctx.update.callback_query.message.reply_to_message)
  let message_id = ctx.update.callback_query.message.reply_to_message.forward_from_message_id
  let chat_id = ctx.update.callback_query.message.reply_to_message.forward_from_chat.id
  
  console.log("message: ", message_id, chat_id)
  
  let new_text = await constructGoalMessage(bot, hostname, goal)

  //get message from chat


  try{
    await bot.telegram.editMessageText(chat_id, message_id, null, new_text);
  } catch(e){
    console.log("same message!")
  }
  // ctx.update.callback_query.message.reply_markup.inline_keyboard[0].map((el, index) => {
  //   console.log("index", index, el)
  //   if (buttons[0][index].text != el.text)
  //     modified = true
  // })

  
  // console.log("modified", modified)

  
  // console.log(buttons)
  
  

}



async function editReportMsg(bot, ctx, user, hostname, reportId) {
  let report = await fetchReport(bot, hostname, reportId);
  let new_text = await constructReportMessage(bot, "core", report)
  


  let buttons = [];
  buttons.push(Markup.button.callback(`👍 (${report.voters.length})`, `rvote ${hostname} ${reportId}`));
   
  // await ctx.editMessageReplyMarkup({ inline_keyboard: buttons });
  console.log(ctx.update)
  let message_id = ctx.update.callback_query.message.message_id
  let chat_id = ctx.update.callback_query.message.chat.id
  
  console.log('1: ', chat_id)
  console.log('2: ', message_id)
  try{
    await bot.telegram.editMessageText(chat_id, message_id, null, new_text, Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
  } catch(e){
    console.log("SAME MESSAG!")
  }

}





async function setBenefactor(bot, user, hostname, goalId, curator) {
  console.log("set Bene")
  const eos = await bot.uni.getEosPassInstance(user.wif);
  
  
    await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'setbenefac',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          host: hostname,
          goal_id: goalId,
          benefactor: curator,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

   await editGoalMsg(bot, ctx, user, hostname, goalId);

  
}



async function rvoteAction(bot, ctx, user, hostname, reportId, up) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
    console.log("on VOTE ACTION")  
  await disableButtons(bot, ctx, up)

  let host = await fetchHost(bot, hostname)
  let report = await fetchReport(bot, hostname, reportId);
  let actions = []

  if (user.eosname == host.architect && report.approved == 0){
    console.log("SINSIDE")
    actions.push({
        account: 'unicore',
        name: 'approver',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          host: hostname,
          report_id: reportId,
          comment: "",
        },
      })
  }

  actions.push({
        account: 'unicore',
        name: 'rvote',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          voter: user.eosname,
          host: hostname,
          report_id: reportId,
          up: up,
        },
      })

  try {
    await eos.transact({
      actions: actions,
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });
    
    await editReportMsg(bot, ctx, user, hostname, reportId)
    // await editGoalMsg(bot, ctx, user, hostname, reportId);

  } catch (e) {
    console.log("on error: ", )
    if (e.message === 'assertion failure with message: You dont have shares for voting process') {
      ctx.reply('Ошибка: У вас нет силы голоса для управления отчётами.', {reply_to_message_id: ctx.update.callback_query.message.reply_to_message.message_id});
    } else {
      let msg_id = (await ctx.reply(e.message, {reply_to_message_id: ctx.update.callback_query.message.reply_to_message.message_id})).message_id;
      setTimeout(() => ctx.deleteMessage(msg_id), 5000)
    }

    console.error(e);
    await enableReportButtons(bot, ctx, up, hostname, reportId)

  }
}

async function voteAction(bot, ctx, user, hostname, goalId, up) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  
  await disableButtons(bot, ctx, up)

  console.log("on VOTE ACTION")
  try {
    await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'vote',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          voter: user.eosname,
          host: hostname,
          goal_id: goalId,
          up: up,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    await editGoalMsg(bot, ctx, user, hostname, goalId);

  } catch (e) {
    if (e.message === 'assertion failure with message: You dont have shares for voting process') {
      ctx.reply('Ошибка: У вас нет силы голоса для управления целями.');
    } else {
      let msg_id = (await ctx.reply(e.message, {reply_to_message_id: ctx.update.callback_query.message.reply_to_message.message_id})).message_id;
      setTimeout(() => ctx.deleteMessage(msg_id), 5000)
    }

    console.error(e);
  }
}

async function burnNow(bot, ctx, user) {
  const eos = await bot.uni.getEosPassInstance(user.wif);

  try {
    await eos.transact({
      actions: [{
        account: 'eosio.token',
        name: 'transfer',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          from: user.eosname,
          to: 'unicore',
          quantity: user.burn.amount,
          memo: `800-${user.burn.hostname}`,
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const buttons = [];

    buttons.push(Markup.button.callback('Показать все цели', `showgoals ${user.burn.hostname} `));
    try{
      ctx.editMessageText('Сила голоса успешно пополнена.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());
    } catch(e){
      console.log("same message!")
    }
    // eslint-disable-next-line no-param-reassign
    user.burn = {};
    await saveUser(bot.instanceName, user);
  } catch (e) {
    ctx.reply(e.message);
    console.error(e);
  }
}

async function createGoal(bot, ctx, user, goal) {
  const eos = await bot.uni.getEosPassInstance(user.wif);
  let res 
  if (!user.create_goal)
    user.create_goal = {}
  
  try {
    res = await eos.transact({
      actions: [{
        account: 'unicore',
        name: 'setgoal',
        authorization: [{
          actor: user.eosname,
          permission: 'active',
        }],
        data: {
          creator: user.eosname,
          host: goal.hostname || user.create_goal.hostname,
          parent_id: goal.parent_id || 0,
          title: goal.title || user.create_goal.title,
          description: goal.description || user.create_goal.description,
          target: goal.target || user.create_goal.target || parseFloat(0).toFixed(4) + " FLOWER",
          meta: JSON.stringify(goal.meta || {}),
        },
      }],
    }, {
      blocksBehind: 3,
      expireSeconds: 30,
    });

    const cons = res.processed.action_traces[0].console;
    console.log("CONSOLE: ", cons)

    const [, goalId] = cons.split('GOAL_ID:');
    console.log("GOALID: ", goalId)
    // operatorOrder.id = orderId;

    const buttons = [];

    // buttons.push(Markup.button.callback('Показать все цели', `showgoals ${user.create_goal.hostname} `));
    // ctx.editMessageText('Ваша цель успешно создана и добавлена в общий список.', Markup.inlineKeyboard(buttons, { columns: 1 }).resize());

    // eslint-disable-next-line no-param-reassign
    user.create_goal = {};
    console.log("GOAL CREATED!")
    await saveUser(bot.instanceName, user);
    return goalId
  } catch (e) {
    ctx.reply(e.message, {reply_to_message_id: ctx.update.message.message_id});

    console.error(e);
  }
}

async function printGoalsMenu(bot, ctx, user, hostname) {
  const goals = await fetchGoals(hostname);
  const conditions = await fetchConditions(hostname);
  let upower = await fetchUPower(hostname, user.eosname);

  console.log('goals', goals.length);
  let index = 1;
  // eslint-disable-next-line no-restricted-syntax
  for (const goal of goals) {
    const buttons = [];

    if (goal.voters.find((el) => user.eosname === el)) {
      buttons.push(Markup.button.callback('Снять голос', `voteup ${hostname} ${goal.id}`));
    } else if (goal.status !== 'filled') {
      buttons.push(Markup.button.callback('Проголосовать ЗА', `voteup ${hostname} ${goal.id}`));
    }
    // eslint-disable-next-line no-await-in-loop,max-len
    await ctx.reply(getGoalMsg(goal), Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
    index += 1;
  }

  const buttons = [];
  buttons.push(Markup.button.callback('Назад', `backto helix ${hostname}`));

  if (bot.getEnv().WHO_CAN_SET_GOALS === 'any' || (bot.getEnv().WHO_CAN_SET_GOALS === 'admin' && Number(user.id) === Number(process.env.ADMIN_ID))) {
    buttons.push(Markup.button.callback('Создать цель', `creategoal ${hostname}`));
  }

  buttons.push(Markup.button.callback('Пополнить силу голоса', `burn ${hostname}`));

  const maxVotesCondition = conditions.find((el) => el.key_string === 'maxuvotes');
  const maxVotesCount = maxVotesCondition ? maxVotesCondition.value : 0;

  upower = `${parseFloat(upower / 10000).toFixed(4)} FLOWER`;
  const votesCount = await getVotesCount(hostname, user.eosname);

  const mingamountCondition = conditions.find((el) => el.key_string === 'mingamount');
  const mingamount = mingamountCondition ? mingamountCondition.value : 0;

  const mingpercentCondition = conditions.find((el) => el.key_string === 'mingpercent');
  const mingpercent = mingpercentCondition ? mingpercentCondition.value / 10000 : 0;

  // eslint-disable-next-line no-nested-ternary
  const fillAmount = mingamount === 0 ? (mingpercent === 0 ? 'без ограничений' : `${mingpercent}% от суммы`) : `${parseFloat(mingamount / 10000).toFixed(4)} FLOWER`;
  let text = '';

  text += `\nСтоимость постановки цели: ${fillAmount}`;
  text += `\nВаша сила голоса: ${upower}`;
  text += `\nВаши голоса: ${maxVotesCount - votesCount} из ${maxVotesCount}`;

  await ctx.reply(text, Markup.inlineKeyboard(buttons, { columns: 2 }).resize());
}

module.exports = {
  printGoalsMenu,
  voteAction,
  rvoteAction,
  createGoal,
  burnNow,
  setBenefactor,
  constructGoalMessage,
  constructReportMessage,
  constructTaskMessage
};
