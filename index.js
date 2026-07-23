import { Client, GatewayIntentBits, Events } from 'discord.js';
import 'dotenv/config';
import fs from 'fs';

const { DISCORD_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN } = process.env;

if (!DISCORD_TOKEN || !CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) {
  console.error('Errore: Una o più variabili d\'ambiente (DISCORD_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN) non sono state impostate.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let baseIdentity = "Sei un interlocutore estremamente razionale.";
try {
  const promptData = fs.readFileSync('./prompt.json', 'utf-8');
  const promptJson = JSON.parse(promptData);
  if (promptJson.baseIdentity) {
    baseIdentity = promptJson.baseIdentity;
    console.log("Personalità caricata con successo da prompt.json.");
  }
} catch (error) {
  console.warn("Attenzione: file prompt.json non trovato o non valido. Verrà usata la personalità di default.");
  console.error(error);
}

async function getAIResponse(messages, env) {
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
      console.error('Cloudflare AI Error:', await response.text());
      throw new Error(`Cloudflare API Error: ${response.statusText}`);
    }
    const result = await response.json();
    const reply = result?.result?.response;
    if (!reply) throw new Error("Risposta vuota dall'IA");
    return reply.length > 2000 ? reply.substring(0, 1997) + '...' : reply;
  } catch (err) {
    console.error('Errore durante la chiamata a Cloudflare AI:', err);
    return "Scusa, ConsiliumAI è momentaneamente indisponibile. Riprova più tardi.";
  }
}

client.once(Events.ClientReady, (c) => {
  console.log(`ConsiliumAI è online! Autenticato come ${c.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ask') {
    const question = interaction.options.getString('question');
    
    await interaction.deferReply();

    const aiReply = await getAIResponse([{ role: 'user', content: question }]);
    
    await interaction.editReply(aiReply);
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  if (!message.mentions.has(client.user)) return;

  try {
    await message.channel.sendTyping();

    const messageHistory = await message.channel.messages.fetch({ limit: 10 });
    const context = messageHistory
      .reverse()
      .map(msg => ({
        role: msg.author.id === client.user.id ? 'assistant' : 'user',
        content: msg.content,
      }));

    const aiReply = await getAIResponse(context);
    await message.reply(aiReply);
  } catch (error) {
    console.error("Errore durante la gestione della menzione:", error);
    await message.reply("Oops, qualcosa è andato storto mentre cercavo di rispondere.");
  }
});

client.login(DISCORD_TOKEN);