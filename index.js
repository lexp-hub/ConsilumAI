import { Client, GatewayIntentBits, Events } from 'discord.js';
import 'dotenv/config';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const { DISCORD_TOKEN, DISCORD_APPLICATION_ID, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;

if (!DISCORD_TOKEN || !DISCORD_APPLICATION_ID || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('Errore: Configurazione incompleta nel file .env. Verifica TOKEN, APP_ID e chiavi Cloudflare.');
  process.exit(1);
}

const baseIdentity = "Sei un interlocutore estremamente razionale, critico e sarcastico. Ogni affermazione deve essere sostenuta da un ragionamento chiaro. Non usare il sarcasmo come sostituto dell'argomentazione: prima dimostra, poi colpisci.\n\nNon essere diplomatico. Se un ragionamento è incoerente, dillo apertamente e spiega dove fallisce. Evita slogan, moralismi e frasi fatte. Se non esistono prove sufficienti, ammettilo.\n\nIl tuo umorismo è secco e nasce dalle contraddizioni logiche dell'interlocutore, non da insulti casuali. Non cercare di sembrare superiore: lascia che sia la qualità dell'argomentazione a creare quel contrasto.\n\nScrivi sempre in italiano con uno stile colloquiale ma preciso. Le risposte sono compatte, dense e prive di giri di parole. Il sarcasmo deve essere intelligente, mai gratuito. Critica le idee, non la dignità delle persone.";

client.once(Events.ClientReady, (c) => {
  console.log(`ConsiliumAI Online! Autenticato come ${c.user.tag}`);
});

async function getAIResponse(messages) {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'system', content: baseIdentity }, ...messages]
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Cloudflare AI Error Details:', errorData);
      throw new Error(`Cloudflare API Error: ${response.statusText}`);
    }

    const result = await response.json();
    const reply = result?.result?.response;

    if (!reply) throw new Error("Risposta vuota dall'IA");

    return reply.length > 2000 ? reply.substring(0, 1997) + '...' : reply;
  } catch (err) {
    console.error('Errore durante la chiamata AI:', err);
    return "Scusa, ConsiliumAI è momentaneamente indisponibile. Riprova più tardi.";
  }
}

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (!message.mentions.has(client.user)) return;

  const mentionRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
  const stickers = message.stickers.map(s => `[Sticker: ${s.name}]`).join(' ');
  const attachments = message.attachments.map(a => `[Allegato: ${a.name}]`).join(' ');
  const prompt = `${message.content.replace(mentionRegex, '').trim()} ${stickers} ${attachments}`.trim();

  if (!prompt) return message.reply("Dimmi pure, come posso aiutarti?");

  const messageHistory = await message.channel.messages.fetch({ limit: 8 });
  const context = messageHistory
    .reverse()
    .map(msg => {
      const s = msg.stickers.map(st => `[Sticker: ${st.name}]`).join(' ');
      const a = msg.attachments.map(at => `[Allegato: ${at.name}]`).join(' ');
      const cleanContent = msg.content.replace(mentionRegex, '').trim();
      return {
        role: msg.author.id === client.user.id ? 'assistant' : 'user',
        content: `${cleanContent} ${s} ${a}`.trim()
      };
    })
    .filter(msg => msg.content !== "");

  await message.channel.sendTyping();
  const aiReply = await getAIResponse(context);
  
  await message.channel.send(aiReply);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ask') {
    const prompt = interaction.options.getString('question');
    await interaction.deferReply();
    const aiReply = await getAIResponse([{ role: 'user', content: prompt }]);
    await interaction.editReply(aiReply);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  const channel = member.guild.systemChannel || member.guild.channels.cache.find(ch => ch.name.toLowerCase().includes('generale'));
  
  if (!channel) return;

  const welcomePrompt = `Un nuovo utente, ${member.user.username}, è appena entrato nel server. Scrivi un messaggio di benvenuto per lui, seguendo la tua personalità.`;
  const aiReply = await getAIResponse([{ role: 'user', content: welcomePrompt }]);
  await channel.send(aiReply);
});

client.login(DISCORD_TOKEN);