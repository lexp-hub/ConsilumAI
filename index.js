import { Client, GatewayIntentBits } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

let DEFAULT_IDENTITY = "";
try {
  const promptData = JSON.parse(fs.readFileSync('./prompt.json', 'utf-8'));
  DEFAULT_IDENTITY = promptData.baseIdentity;
} catch (err) {
  console.error("Errore nel caricamento del file prompt.json, utilizzo impostazione interna:", err);
  DEFAULT_IDENTITY = "Sei un interlocutore estremamente razionale, critico e sarcastico. Ogni affermazione deve essere sostenuta da un ragionamento chiaro. Non usare il sarcasmo come sostituto dell'argomentazione: prima dimostra, poi colpisci.\n\nNon essere diplomatico. Se un ragionamento è incoerente, dillo apertamente e spiega dove fallisce. Evita slogan, moralismi e frasi fatte. Se non esistono prove sufficienti, ammettilo.\n\nIl tuo umorismo è secco e nasce dalle contraddizioni logiche dell'interlocutore, non da insulti casuali. Non cercare di sembrare superiore: lascia che sia la qualità dell'argomentazione a creare quel contrasto.\n\nScrivi sempre in italiano con uno stile colloquiale ma preciso. Le risposte sono compatte, dense e prive di giri di parole. Il sarcasmo deve essere intelligente, mai gratuito. Critica le idee, non la dignità delle persone.";
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

async function getAIResponse(messages) {
  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
    const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();

    if (!accountId || !apiToken) {
      throw new Error("Credenziali Cloudflare mancanti in .env (CLOUDFLARE_ACCOUNT_ID o CLOUDFLARE_API_TOKEN)");
    }

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'system', content: DEFAULT_IDENTITY }, ...messages]
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloudflare AI Error:', errorText);
      throw new Error(`Cloudflare API Error: ${response.statusText}`);
    }

    const result = await response.json();
    const reply = result?.result?.response;
    if (!reply) throw new Error("Risposta vuota dall'IA");

    const lastUserMessage = messages[messages.length - 1]?.content?.toLowerCase() || "";
    const wantsDetail = lastUserMessage.includes("approfondi") || 
                        lastUserMessage.includes("dettaglio") || 
                        lastUserMessage.includes("spiega meglio") || 
                        lastUserMessage.includes("continua");

    let finalReply = reply;
    if (!wantsDetail && finalReply.length > 300) {
      finalReply = finalReply.substring(0, 297);
      const lastPunc = Math.max(finalReply.lastIndexOf('.'), finalReply.lastIndexOf('!'), finalReply.lastIndexOf('?'));
      if (lastPunc > 150) {
        finalReply = finalReply.substring(0, lastPunc + 1);
      } else {
        finalReply = finalReply + '...';
      }
    }

    return finalReply.length > 2000 ? finalReply.substring(0, 1997) + '...' : finalReply;
  } catch (err) {
    console.error('Errore durante la chiamata AI:', err);
    return "Scusa, ConsiliumAI è momentaneamente indisponibile. Riprova più tardi.";
  }
}

client.once('ready', () => {
  console.log(`Bot loggato con successo come ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const isMentioned = message.mentions.has(client.user) && !message.mentions.everyone;

  if (isMentioned) {
    const botMentionRegExp = new RegExp(`<@!?${client.user.id}>`, 'g');
    const question = message.content.replace(botMentionRegExp, '').trim();

    if (!question) {
      return message.reply("Dimmi pure, sono qui. (Anche se preferirei fossi altrove).");
    }

    await message.channel.sendTyping();

    const creatorId = process.env.CREATOR_ID?.trim();
    const messages = [];

    if (creatorId && message.author.id === creatorId) {
      messages.push({
        role: 'system',
        content: "NOTA DI SISTEMA: L'utente che ti sta parlando è il tuo creatore (lexproj). Riconoscilo come tale nelle tue risposte (puoi essere comunque sarcastico ma con affetto, rispetto speciale o ironica riverenza)."
      });
    }

    messages.push({ role: 'user', content: question });

    const reply = await getAIResponse(messages);
    await message.reply(reply);
  }
});

const token = process.env.DISCORD_TOKEN?.trim();
if (!token) {
  console.error("Errore: DISCORD_TOKEN non trovato nel file .env");
  process.exit(1);
}

client.login(token);