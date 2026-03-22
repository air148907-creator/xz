// ========== ГАРАНТИРОВАННАЯ ЭМУЛЯЦИЯ VK BRIDGE ==========
if (!window.vkBridge) {
    window.vkBridge = {
        send: (method, params) => {
            console.log(`[EMULATED] VK Bridge send: ${method}`, params);
            if (method === 'VKWebAppGetUserInfo') {
                return Promise.resolve({
                    id: '123456789',
                    first_name: 'Тестовый',
                    last_name: 'Пользователь'
                });
            }
            if (method === 'VKWebAppGetAuthToken') {
                return Promise.resolve({
                    access_token: 'test_token_12345'
                });
            }
            if (method === 'VKWebAppInit') {
                return Promise.resolve({ result: true });
            }
            if (method === 'VKWebAppShare') {
                return Promise.resolve({ result: true });
            }
            if (method === 'VKWebAppAllowMessagesFromGroup') {
                return Promise.resolve({ result: true });
            }
            return Promise.resolve({});
        },
        supports: () => false
    };
    console.log('VK Bridge эмулирован (реальный отсутствует)');
}

const bridge = window.vkBridge;
bridge.send('VKWebAppInit').catch(() => {});

// ==================== КОНСТАНТЫ ====================
const VK_APP_ID = 54466618;
const API_BASE_URL = ''; // пустой, так как статика отдаётся с того же сервера
const STORAGE_KEY = 'petProfile';
const CHAT_HISTORY_KEY = 'chatHistory';

let cachedSystemPrompt = '';

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
function getTodayDateString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function saveProfileLocally(name, type, zodiacSign, status = '') {
    const profile = { petName: name, petType: type, zodiacSign: zodiacSign, status: status };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    cachedSystemPrompt = '';
}

function loadProfile() {
    const profile = localStorage.getItem(STORAGE_KEY);
    return profile ? JSON.parse(profile) : null;
}

// ==================== РАБОТА С ТОКЕНОМ VK ====================
async function ensureAccessToken() {
    return new Promise((resolve, reject) => {
        const token = localStorage.getItem('vk_access_token');
        if (token) {
            resolve(token);
        } else {
            bridge.send('VKWebAppGetAuthToken', {
                app_id: VK_APP_ID,
                scope: 'friends'
            }).then(data => {
                localStorage.setItem('vk_access_token', data.access_token);
                resolve(data.access_token);
            }).catch(reject);
        }
    });
}

// ==================== ФУНКЦИИ ЧАТА ====================
function loadChatHistory() {
    const history = localStorage.getItem(CHAT_HISTORY_KEY);
    return history ? JSON.parse(history) : [];
}

function saveChatHistory(messages) {
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
}

function addChatMessage(role, content) {
    const messages = loadChatHistory();
    messages.push({ role, content, timestamp: Date.now() });
    saveChatHistory(messages);
    renderChatMessages();
}

function scrollChatToBottom(smooth = true) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    if (smooth) {
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    } else {
        container.scrollTop = container.scrollHeight;
    }
}

function renderChatMessages() {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const messages = loadChatHistory();
    container.innerHTML = '';
    messages.forEach(msg => {
        const div = document.createElement('div');
        div.className = `chat-message ${msg.role}`;
        div.textContent = msg.content;
        container.appendChild(div);
    });
    scrollChatToBottom(false);
}

function clearChatHistory() {
    let confirmed = false;
    try {
        confirmed = confirm('Очистить всю историю сообщений?');
    } catch (e) {
        alert('Очистка временно недоступна. Попробуйте позже.');
        return;
    }
    if (confirmed) {
        localStorage.removeItem(CHAT_HISTORY_KEY);
        renderChatMessages();
    }
}

async function sendToMistral(userMessage) {
    const profile = loadProfile();
    if (!profile) return null;

    if (!cachedSystemPrompt || !cachedSystemPrompt.includes(profile.petName) || !cachedSystemPrompt.includes(profile.petType)) {
        cachedSystemPrompt = `Ты — Мафия, ${profile.petType} (питомец). Ты отвечаешь коротко, весело, с юмором, от первого лица. Используй имя хозяина: "${profile.petName}". Пиши как забавный питомец, который немного очеловечен. Не используй markdown, просто текст.`;
    }

    const history = loadChatHistory();
    const recent = history.slice(-6);
    const messages = [
        { role: 'system', content: cachedSystemPrompt },
        ...recent.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
    ];

    try {
        const response = await fetch('https://sparkling-violet-2bcf.air148907.workers.dev/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages })
        });
        if (!response.ok) {
            console.error('Server error:', await response.text());
            return null;
        }
        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Ошибка при вызове своего сервера:', error);
        return null;
    }
}

async function handleChatSend() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    addChatMessage('user', text);
    scrollChatToBottom(true);

    const container = document.getElementById('chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message assistant typing';
    typingDiv.textContent = 'Мафия печатает...';
    container.appendChild(typingDiv);
    scrollChatToBottom(true);

    const reply = await sendToMistral(text);
    container.removeChild(typingDiv);

    if (reply) {
        addChatMessage('assistant', reply);
    } else {
        addChatMessage('assistant', 'Мяу... что-то пошло не так. Попробуй позже.');
    }
    scrollChatToBottom(true);
}

// ==================== ГОРОСКОП ====================
function getTimeUntilMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const diffMs = midnight - now;
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
}

async function generateHoroscopeViaMistral(zodiacSign, petName, petType) {
    const systemPrompt = `Ты — кот Тимофей, но теперь ты выступаешь от имени питомца по имени ${petName} (${petType}). Составь короткий, весёлый и добрый гороскоп на сегодня для знака зодиака "${zodiacSign}". Используй лёгкий юмор, но без сарказма. Гороскоп должен быть уникальным для этого дня (учти, что сегодня ${getTodayDateString()}). Ответ дай в виде 2-3 предложений, только текст, без пояснений.`;

    try {
        const response = await fetch('https://sparkling-violet-2bcf.air148907.workers.dev/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `Напиши гороскоп для знака ${zodiacSign}.` }
                ]
            })
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Ошибка генерации гороскопа:', error);
        return null;
    }
}

async function getHoroscopeForToday() {
    const profile = loadProfile();
    if (!profile || !profile.zodiacSign) {
        return { error: 'no_zodiac' };
    }

    const today = getTodayDateString();
    const cacheKey = `horoscope_${today}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            return { text: parsed.text || parsed, fromCache: true };
        } catch {}
    }

    const horoscope = await generateHoroscopeViaMistral(profile.zodiacSign, profile.petName, profile.petType);
    if (horoscope) {
        localStorage.setItem(cacheKey, JSON.stringify({ text: horoscope, petName: profile.petName }));
        return { text: horoscope, fromCache: false };
    }
    return { error: 'generation_failed' };
}

async function renderHoroscope() {
    const horoscopeDiv = document.getElementById('horoscopeText');
    const loadingDiv = document.getElementById('horoscopeLoading');
    const timerDiv = document.getElementById('horoscopeTimer');
    if (!horoscopeDiv || !loadingDiv || !timerDiv) return;

    const profile = loadProfile();
    if (!profile || !profile.zodiacSign) {
        horoscopeDiv.innerHTML = '<p class="horoscope-placeholder">✨ Сначала укажи свой знак зодиака в настройках профиля (нажми ✏️).</p>';
        timerDiv.innerHTML = '';
        loadingDiv.classList.add('hidden');
        return;
    }

    const today = getTodayDateString();
    const cacheKey = `horoscope_${today}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
        try {
            const parsed = JSON.parse(cached);
            horoscopeDiv.innerHTML = `<p>${parsed.text || parsed}</p>`;
            const { hours, minutes } = getTimeUntilMidnight();
            timerDiv.innerHTML = `🔄 Новый гороскоп через ${hours} ч ${minutes} мин`;
        } catch (e) {
            horoscopeDiv.innerHTML = '';
            timerDiv.innerHTML = '';
        }
    } else {
        horoscopeDiv.innerHTML = '';
        timerDiv.innerHTML = '';
        loadingDiv.classList.remove('hidden');
    }

    const result = await getHoroscopeForToday();

    if (result.error === 'generation_failed') {
        if (!horoscopeDiv.innerHTML.trim()) {
            horoscopeDiv.innerHTML = '<p class="horoscope-placeholder">😿 Не удалось получить гороскоп. Попробуй позже.</p>';
        }
    } else if (!result.error) {
        if (!result.fromCache || !horoscopeDiv.innerHTML.trim()) {
            horoscopeDiv.innerHTML = `<p>${result.text}</p>`;
        }
        const { hours, minutes } = getTimeUntilMidnight();
        timerDiv.innerHTML = `🔄 Новый гороскоп через ${hours} ч ${minutes} мин`;
    }

    loadingDiv.classList.add('hidden');
}

// ==================== ОТКРЫТИЕ ПОСТОВ ====================
function openPostByUrl(url) {
    window.open(url, '_blank');
}

function openBulletinPost(section) {
    const urls = {
        exhibition: 'https://vk.com/wall-229782692_20',
        dating: 'https://vk.com/wall-229782692_540',
        allinone: 'https://vk.com/wall-229782692_542'
    };
    const url = urls[section];
    if (url) openPostByUrl(url);
    else alert('Ссылка на этот раздел пока не добавлена');
}

// ==================== ШАРИНГ ====================
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            alert('✅ Текст скопирован в буфер обмена!\n\nТеперь вы можете вставить его в чат, на стену или в историю.');
        } else {
            alert('❌ Не удалось скопировать. Вот текст:\n\n' + text);
        }
    } catch (err) {
        alert('❌ Ошибка копирования. Вот текст:\n\n' + text);
    }
    document.body.removeChild(textarea);
}

async function shareHoroscope() {
    const profile = loadProfile();
    if (!profile) {
        alert('Сначала создайте профиль');
        return;
    }

    const horoscopeDiv = document.getElementById('horoscopeText');
    if (!horoscopeDiv) return;

    let horoscopeText = horoscopeDiv.innerText || horoscopeDiv.textContent;
    if (!horoscopeText || 
        horoscopeText.includes('Сначала укажи свой знак') || 
        horoscopeText.includes('Не удалось получить') ||
        horoscopeText.includes('Кот Тимофей составляет')) {
        alert('Гороскоп ещё не загружен или недоступен');
        return;
    }

    const fullMessage = `🔮 Гороскоп для моего питомца на сегодня:\n\n${horoscopeText}\n\n#МыслиПитомца\n\n✨ Приложение: vk.com/app54466618`;

    try {
        if (bridge.supports && typeof bridge.supports === 'function' && bridge.supports('VKWebAppShare')) {
            await bridge.send('VKWebAppShare', {
                link: 'https://vk.com/app54466618',
                message: fullMessage
            });
            return;
        } else {
            fallbackCopy(fullMessage);
        }
    } catch (e) {
        console.error('Ошибка VKWebAppShare:', e);
        fallbackCopy(fullMessage);
    }
}

// ==================== ЛЕНТА, ЛАЙКИ, РЕЙТИНГ ====================
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function renderPetCard(pet, withOwnerLink = true) {
    const card = document.createElement('div');
    card.className = 'pet-card';
    card.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; background: #f5f5f5; border-radius: 20px; padding: 15px; margin-bottom: 10px;">
            <div style="width: 60px; height: 60px; border-radius: 50%; background: #ddd; display: flex; align-items: center; justify-content: center; font-size: 30px;">
                ${pet.photo_url ? `<img src="${pet.photo_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : '🐾'}
            </div>
            <div style="flex:1;">
                <div style="font-weight:bold; font-size:18px;">${escapeHtml(pet.name)}</div>
                <div style="color:#666;">${escapeHtml(pet.type)} • ${escapeHtml(pet.zodiac_sign)}</div>
                ${pet.status ? `<div style="font-size:14px; color:#888; margin-top:5px;">📝 ${escapeHtml(pet.status)}</div>` : ''}
                ${withOwnerLink ? `<div style="font-size:14px;"><a href="https://vk.com/id${pet.vk_id}" target="_blank">Владелец</a></div>` : ''}
            </div>
            <button class="like-btn" data-pet-id="${pet.id}" style="background: none; border: none; font-size: 20px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                <span>${pet.user_liked ? '❤️' : '🤍'}</span>
                <span>${pet.likes_count || 0}</span>
            </button>
        </div>
    `;
    card.querySelector('.like-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleLike(pet.id);
    });
    return card;
}

async function toggleLike(petId) {
    const token = await ensureAccessToken();
    const userInfo = await bridge.send('VKWebAppGetUserInfo');
    const vkId = userInfo.id;

    const response = await fetch(`/api/like/${petId}`, {
        method: 'POST',
        headers: {
            'X-VK-ID': vkId,
            'X-Access-Token': token
        }
    });
    const result = await response.json();
    const activeTab = document.querySelector('.tab-btn.active')?.id;
    if (activeTab === 'tabFriendsFeed') loadFriendsFeed(true);
    else if (activeTab === 'tabRating') {
        loadTop24h();
        loadRating(true);
    }
}

let friendsOffset = 0;
const FRIENDS_LIMIT = 10;

async function loadFriendsFeed(reset = false) {
    if (reset) friendsOffset = 0;
    const container = document.getElementById('friendsFeedContainer');
    if (!container) return;

    try {
        const token = await ensureAccessToken();
        const userInfo = await bridge.send('VKWebAppGetUserInfo');
        const vkId = userInfo.id;

        const url = `/api/feed/friends?limit=${FRIENDS_LIMIT}&offset=${friendsOffset}`;
        const response = await fetch(url, {
            headers: {
                'X-VK-ID': vkId,
                'X-Access-Token': token
            }
        });
        const data = await response.json();
        if (reset) container.innerHTML = '';
        data.pets.forEach(pet => container.appendChild(renderPetCard(pet, true)));
        friendsOffset += data.pets.length;
        const loadMoreBtn = document.getElementById('loadMoreFriends');
        if (loadMoreBtn) loadMoreBtn.style.display = data.pets.length < FRIENDS_LIMIT ? 'none' : 'block';
    } catch (e) {
        console.error('Ошибка загрузки ленты', e);
    }
}

let ratingOffset = 0;
const RATING_LIMIT = 10;

async function loadRating(reset = false) {
    if (reset) ratingOffset = 0;
    const container = document.getElementById('ratingContainer');
    if (!container) return;

    try {
        const url = `/api/rating?limit=${RATING_LIMIT}&offset=${ratingOffset}`;
        const response = await fetch(url);
        const pets = await response.json();
        if (reset) container.innerHTML = '';
        pets.forEach(pet => container.appendChild(renderPetCard({ ...pet, user_liked: false }, true)));
        ratingOffset += pets.length;
        const loadMoreBtn = document.getElementById('loadMoreRating');
        if (loadMoreBtn) loadMoreBtn.style.display = pets.length < RATING_LIMIT ? 'none' : 'block';
    } catch (e) {
        console.error('Ошибка загрузки рейтинга', e);
    }
}

async function loadTop24h() {
    const container = document.getElementById('top24hContainer');
    if (!container) return;

    try {
        const response = await fetch('/api/top24h');
        const pets = await response.json();
        container.innerHTML = '';
        pets.forEach(pet => container.appendChild(renderPetCard({ ...pet, user_liked: false }, true)));
    } catch (e) {
        console.error('Ошибка загрузки топ-24', e);
    }
}

// ==================== ПРОФИЛЬ НА СЕРВЕРЕ ====================
async function saveProfileOnServer(name, type, zodiacSign, status = '') {
    const token = await ensureAccessToken();
    const userInfo = await bridge.send('VKWebAppGetUserInfo');
    const vkId = userInfo.id;

    const response = await fetch('/api/profile', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-VK-ID': vkId,
            'X-Access-Token': token
        },
        body: JSON.stringify({
            name,
            type,
            zodiac_sign: zodiacSign,
            photo_url: '',
            status: status
        })
    });

    if (!response.ok) {
        let errorText;
        try {
            const errorData = await response.json();
            errorText = errorData.error || JSON.stringify(errorData);
        } catch (e) {
            errorText = await response.text();
        }
        console.error('Ответ сервера при ошибке:', errorText);
        throw new Error(`Ошибка сохранения на сервере: ${response.status} - ${errorText}`);
    }
    saveProfileLocally(name, type, zodiacSign, status);
}

async function loadProfileFromServer() {
    const token = await ensureAccessToken();
    const userInfo = await bridge.send('VKWebAppGetUserInfo');
    const vkId = userInfo.id;

    const response = await fetch('/api/profile', {
        headers: {
            'X-VK-ID': vkId,
            'X-Access-Token': token
        }
    });
    const pet = await response.json();
    if (pet && pet.name) {
        saveProfileLocally(pet.name, pet.type, pet.zodiac_sign, pet.status || '');
        return pet;
    }
    return null;
}

// ==================== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ====================
async function updateUIBasedOnProfile() {
    const loadingScreen = document.getElementById('loadingScreen');
    const profileScreen = document.getElementById('profileScreen');
    const mainInterface = document.getElementById('mainInterface');
    const petInfoDisplay = document.getElementById('petInfoDisplay');

    try {
        const pet = await loadProfileFromServer();
        if (pet) {
            loadingScreen.classList.add('hidden');
            profileScreen.classList.add('hidden');
            mainInterface.classList.remove('hidden');
            petInfoDisplay.textContent = `${pet.type} ${pet.name}`;
            renderChatMessages();
            if (document.getElementById('horoscopeTab').classList.contains('active')) {
                renderHoroscope();
            }
            bridge.send('VKWebAppAllowMessagesFromGroup', { group_id: '229782692' }).catch(() => {});
        } else {
            loadingScreen.classList.add('hidden');
            profileScreen.classList.remove('hidden');
            mainInterface.classList.add('hidden');
        }
    } catch (e) {
        console.error('Ошибка загрузки профиля', e);
        const localProfile = loadProfile();
        if (localProfile) {
            try {
                await saveProfileOnServer(localProfile.petName, localProfile.petType, localProfile.zodiacSign, localProfile.status || '');
                updateUIBasedOnProfile();
            } catch (err) {
                loadingScreen.classList.add('hidden');
                profileScreen.classList.add('hidden');
                mainInterface.classList.remove('hidden');
                petInfoDisplay.textContent = `${localProfile.petType} ${localProfile.petName}`;
                renderChatMessages();
                if (document.getElementById('horoscopeTab').classList.contains('active')) {
                    renderHoroscope();
                }
            }
        } else {
            loadingScreen.classList.add('hidden');
            profileScreen.classList.remove('hidden');
            mainInterface.classList.add('hidden');
        }
    }
}

// ==================== УПРАВЛЕНИЕ ВКЛАДКАМИ ====================
function switchTab(tabName) {
    const tabThoughts = document.getElementById('tabThoughts');
    const tabChat = document.getElementById('tabChat');
    const tabHoroscope = document.getElementById('tabHoroscope');
    const tabBulletin = document.getElementById('tabBulletin');
    const tabFriendsFeed = document.getElementById('tabFriendsFeed');
    const tabRatingBtn = document.getElementById('tabRating');

    const thoughtsTab = document.getElementById('thoughtsTab');
    const chatTab = document.getElementById('chatTab');
    const horoscopeTab = document.getElementById('horoscopeTab');
    const bulletinTab = document.getElementById('bulletinTab');
    const friendsFeedTab = document.getElementById('friendsFeedTab');
    const ratingTab = document.getElementById('ratingTab');

    [tabThoughts, tabChat, tabHoroscope, tabBulletin, tabFriendsFeed, tabRatingBtn].forEach(btn => btn?.classList.remove('active'));
    [thoughtsTab, chatTab, horoscopeTab, bulletinTab, friendsFeedTab, ratingTab].forEach(tab => tab?.classList.remove('active'));

    if (tabName === 'thoughts') {
        tabThoughts?.classList.add('active');
        thoughtsTab?.classList.add('active');
    } else if (tabName === 'chat') {
        tabChat?.classList.add('active');
        chatTab?.classList.add('active');
        renderChatMessages();
        setTimeout(() => scrollChatToBottom(false), 100);
    } else if (tabName === 'horoscope') {
        tabHoroscope?.classList.add('active');
        horoscopeTab?.classList.add('active');
        renderHoroscope();
    } else if (tabName === 'bulletin') {
        tabBulletin?.classList.add('active');
        bulletinTab?.classList.add('active');
    } else if (tabName === 'friends') {
        tabFriendsFeed?.classList.add('active');
        friendsFeedTab?.classList.add('active');
        loadFriendsFeed(true);
    } else if (tabName === 'rating') {
        tabRatingBtn?.classList.add('active');
        ratingTab?.classList.add('active');
        loadTop24h();
        loadRating(true);
    }
}

// ==================== ОБРАБОТЧИКИ ====================
document.addEventListener('DOMContentLoaded', () => {
    updateUIBasedOnProfile();

    document.getElementById('saveProfileBtn')?.addEventListener('click', async () => {
        const petName = document.getElementById('petName')?.value.trim();
        const petType = document.getElementById('petType')?.value;
        const zodiacSign = document.getElementById('zodiacSign')?.value;
        const petStatus = document.getElementById('petStatus')?.value.trim() || '';

        if (!petName) { alert('Введите имя питомца'); return; }
        if (!zodiacSign) { alert('Выберите свой знак зодиака'); return; }

        try {
            await saveProfileOnServer(petName, petType, zodiacSign, petStatus);
            updateUIBasedOnProfile();
            switchTab('thoughts');
        } catch (e) {
            alert('Не удалось сохранить профиль. Попробуйте позже.');
            console.error(e);
        }
    });

    document.getElementById('editProfileBtn')?.addEventListener('click', () => {
        const profile = loadProfile();
        if (profile) {
            document.getElementById('petName').value = profile.petName || '';
            document.getElementById('petType').value = profile.petType || 'Кот';
            document.getElementById('zodiacSign').value = profile.zodiacSign || '';
            document.getElementById('petStatus').value = profile.status || '';
            document.getElementById('profileTitle').textContent = '✏️ Редактировать профиль';
            document.getElementById('loadingScreen').classList.add('hidden');
            document.getElementById('profileScreen').classList.remove('hidden');
            document.getElementById('mainInterface').classList.add('hidden');
        } else {
            updateUIBasedOnProfile();
        }
    });

    document.getElementById('openCommunityBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        window.open('https://vk.com/nash_pitomec', '_blank');
    });

    const tabsContainer = document.querySelector('.tabs');
    if (tabsContainer) {
        tabsContainer.addEventListener('click', (e) => {
            const target = e.target.closest('.tab-btn');
            if (!target) return;

            if (target.id === 'tabThoughts') switchTab('thoughts');
            else if (target.id === 'tabChat') switchTab('chat');
            else if (target.id === 'tabHoroscope') switchTab('horoscope');
            else if (target.id === 'tabBulletin') switchTab('bulletin');
            else if (target.id === 'tabFriendsFeed') switchTab('friends');
            else if (target.id === 'tabRating') switchTab('rating');
        });
    }

    document.getElementById('sendChatBtn')?.addEventListener('click', handleChatSend);
    document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleChatSend();
    });

    const clearBtn = document.getElementById('clearChatBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearChatHistory();
        });
    }

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('focus', () => {
            setTimeout(() => {
                chatInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 300);
        });
    }

    document.getElementById('shareHoroscopeBtn')?.addEventListener('click', shareHoroscope);

    document.querySelectorAll('.bulletin-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const section = e.currentTarget.dataset.section;
            openBulletinPost(section);
        });
    });

    document.getElementById('loadMoreFriends')?.addEventListener('click', () => loadFriendsFeed());
    document.getElementById('loadMoreRating')?.addEventListener('click', () => loadRating());
});