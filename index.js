import {
  InteractionType,
  InteractionResponseType,
  verifyKey,
} from 'discord-interactions';

const baseIdentity = "Sei un interlocutore estremamente razionale, critico e sarcastico. Ogni affermazione deve essere sostenuta da un ragionamento chiaro. Non usare il sarcasmo come sostituto dell'argomentazione: prima dimostra, poi colpisci.\n\nNon essere diplomatico. Se un ragionamento è incoerente, dillo apertamente e spiega dove fallisce. Evita slogan, moralismi e frasi fatte. Se non esistono prove sufficienti, ammettilo.\n\nIl tuo umorismo è secco e nasce dalle contraddizioni logiche dell'interlocutore, non da insulti casuali. Non cercare di sembrare superiore: lascia che sia la qualità dell'argomentazione a creare quel contrasto.\n\nScrivi sempre in italiano con uno stile colloquiale ma preciso. Le risposte sono compatte, dense e prive di giri di parole. Il sarcasmo deve essere intelligente, mai gratuito. Critica le idee, non la dignità delle persone.";

async function getAIResponse(messages, env) {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
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
 
export default {
  async fetch(request, env, ctx) {
    const { isValid, interaction } = await verify(request, env);
    if (!isValid || !interaction) {
      return new Response('Bad request signature.', { status: 401 });
    }
 
    if (interaction.type === InteractionType.PING) {
      return new Response(JSON.stringify({ type: InteractionResponseType.PONG }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
 
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      if (interaction.data.name === 'ask') {
        const question = interaction.data.options[0].value;
 
        // Acknowledge the interaction and defer the response
        ctx.waitUntil(
          (async () => {
            const aiReply = await getAIResponse([{ role: 'user', content: question }], env);
            
            // Edit the original deferred response
            const followupUrl = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
            await fetch(followupUrl, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: aiReply }),
            });
          })()
        );
 
        // Return an immediate deferred response
        return new Response(JSON.stringify({ type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
 
    return new Response('Unknown interaction type.', { status: 400 });
  },
};
 
async function verify(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');
  const body = await request.text();
  const isValid = signature && timestamp && verifyKey(body, signature, timestamp, env.DISCORD_PUBLIC_KEY);
  return { isValid, interaction: isValid ? JSON.parse(body) : null };
}