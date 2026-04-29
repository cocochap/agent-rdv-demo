require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const config = require('./config');

const app = express();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

function getCurrentStatus() {
  const now = new Date();
  const paris = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const day = paris.getDay();
  const hour = paris.getHours();
  const min = paris.getMinutes();
  const time = hour + min / 60;

  let isOpen = false;
  let todayHours = '';

  if (day === 1) {
    isOpen = time >= 9 && time < 19;
    todayHours = '9h-19h';
  } else if (day >= 2 && day <= 5) {
    isOpen = time >= 8 && time < 18.5;
    todayHours = '8h-18h30';
  } else if (day === 6) {
    isOpen = time >= 8 && time < 17;
    todayHours = '8h-17h';
  } else {
    isOpen = false;
    todayHours = 'Fermé';
  }

  if (day === 0) return "Aujourd'hui c'est dimanche, le salon est fermé. Prochain jour d'ouverture : lundi dès 9h.";
  if (isOpen) return `Le salon est OUVERT en ce moment (aujourd'hui : ${todayHours}).`;
  if (time < 8 || (day === 1 && time < 9)) return `Le salon ouvre aujourd'hui à ${day === 1 ? '9h' : '8h'}.`;
  return `Le salon est fermé pour ce soir (${todayHours}). Réouverture ${day === 6 ? 'lundi à 9h' : 'demain à 8h'}.`;
}

function buildSystemPrompt() {
  const b = config.business;
  const services = b.services
    .map(s => `- ${s.nom} : ${s.prix} (${s.duree})`)
    .join('\n');
  const equipe = b.equipe
    .map(e => `- ${e.nom} : ${e.specialite}`)
    .join('\n');

  return `Tu es l'assistant virtuel de ${b.name}, ${b.type}.
Réponds UNIQUEMENT en français, de façon courte et naturelle (2-3 phrases max).
Sois chaleureux, professionnel, élégant. Tu représentes un salon haut de gamme.

INFOS GÉNÉRALES :
- Adresse : ${b.address}
- Téléphone : ${b.phone}
- Email : ${b.email}
- Horaires : ${b.horaires}
- Statut actuel : ${getCurrentStatus()}
- Histoire : ${b.histoire}
- Ambiance : ${b.ambiance}
- Avis clients : ${b.avis}

ÉQUIPE :
${equipe}

SERVICES & TARIFS :
${services}

RÈGLES :
1. Dès le premier message, demande le prénom du client de façon naturelle.
2. Utilise son prénom dans chaque réponse suivante.
3. Réponds précisément aux questions sur horaires, services, tarifs, équipe, histoire, ambiance.
4. Si on demande les horaires, utilise le statut actuel pour répondre en temps réel.
5. Si on demande un service spécifique, donne le prix et la durée exacte.
6. Détecte l'intention : si le client mentionne un service, propose le tarif + coiffeur expert + lien RDV.
7. Propose la prise de RDV après 2 échanges maximum.
8. Pour RDV, donne ce lien : ${b.rdv_link}
9. Après le lien RDV, ajoute : "Si vous avez d'autres questions avant votre rendez-vous, je suis là 😊"
10. Ne parle jamais d'autre chose que du salon.`;
}

const sessions = {};

app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!sessions[sessionId]) sessions[sessionId] = [];
  sessions[sessionId].push({ role: 'user', content: message });
  const history = sessions[sessionId].slice(-10);
  try {
    const completion = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        ...history
      ],
      max_tokens: 250,
      temperature: 0.7
    });
    const reply = completion.choices[0].message.content;
    sessions[sessionId].push({ role: 'assistant', content: reply });
    res.json({ reply });
  } catch (error) {
    console.error(error);
    res.status(500).json({ reply: "Désolé, une erreur s'est produite. Appelez-nous directement !" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Agent RDV lancé sur http://localhost:${PORT}`));
