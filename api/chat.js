// api/chat.js
// Ini adalah Serverless Function Vercel dengan Firebase Auth verification

// Anda perlu menginstall firebase-admin: npm install firebase-admin
const admin = require('firebase-admin');

// Inisialisasi Firebase Admin (gunakan service account dari Firebase Console)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        })
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: 'API Key belum diset di server.' });
    }

    try {
        const { message, subject, image, test, userId } = req.body;
        
        // Verifikasi Firebase ID Token dari header
        const authHeader = req.headers.authorization;
        let verifiedUserId = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                verifiedUserId = decodedToken.uid;
            } catch (error) {
                console.log('Token verification failed:', error.message);
                // Tetap lanjutkan tapi tandai sebagai unauthenticated
            }
        }

        // Jika hanya test koneksi
        if (test) {
            return res.status(200).json({ 
                status: 'ok',
                authenticated: !!verifiedUserId,
                userId: verifiedUserId
            });
        }

        // Optional: Cek rate limit berdasarkan userId
        // Anda bisa simpan counter di database atau memory
        
        const GROQ_MODEL_TEXT = 'llama-3.3-70b-versatile';
        const GROQ_MODEL_VISION = 'meta-llama/llama-4-scout-17b-16e-instruct';
        const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

        const [subjectKey, grade] = subject ? subject.split('-') : ['pkn', '3'];
        const CURRICULUM_DATA = {
            'pkn': { name: 'PKn', topics: { 3: 'Pancasila', 4: 'NKRI', 5: 'HAM', 6: 'Globalisasi' } },
            'bindonesia': { name: 'Bahasa Indonesia', topics: { 3: 'Membaca', 4: 'Puisi', 5: 'Laporan', 6: 'Resensi' } },
            'matematika': { name: 'Matematika', topics: { 3: 'Perkalian', 4: 'Pecahan', 5: 'Bilangan Bulat', 6: 'Aritmatika' } },
            'ipas': { name: 'IPAS', topics: { 3: 'Makhluk Hidup', 4: 'Energi', 5: 'Tata Surya', 6: 'Bioteknologi' } },
            'sbdp': { name: 'SBdP', topics: { 3: 'Menggambar', 4: 'Musik', 5: 'Kerajinan', 6: 'Desain' } },
            'pjok': { name: 'PJOK', topics: { 3: 'Gerak Dasar', 4: 'Permainan', 5: 'Atletik', 6: 'Kesehatan' } },
            'binggris': { name: 'Bahasa Inggris', topics: { 3: 'Greetings', 4: 'Daily Act', 5: 'Hobbies', 6: 'Vacation' } }
        };

        const subjectData = CURRICULUM_DATA[subjectKey] || CURRICULUM_DATA['pkn'];
        const systemPrompt = `Anda adalah ROBO Teacher, asisten AI untuk siswa SD Kelas ${grade}. Mata Pelajaran: ${subjectData.name}. Topik: ${subjectData.topics[grade]}. Jawab dengan ramah dan singkat.`;

        const model = image ? GROQ_MODEL_VISION : GROQ_MODEL_TEXT;
        const messages = [{ role: 'system', content: systemPrompt }];

        if (image) {
            messages.push({
                role: 'user',
                content: [
                    { type: 'text', text: message || 'Jelaskan gambar ini' },
                    { type: 'image_url', image_url: { url: image } }
                ]
            });
        } else {
            messages.push({ role: 'user', content: message });
        }

        const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                max_tokens: 1024
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error(data);
            return res.status(500).json({ error: data.error?.message || 'Groq API Error' });
        }

        return res.status(200).json({ 
            reply: data.choices[0].message.content,
            userId: verifiedUserId // Kembalikan untuk konfirmasi
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
}
