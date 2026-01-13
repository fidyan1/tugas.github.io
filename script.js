/**
 * Smart To-Do List Application
 * Architecture: Modular (Object-Based)
 */

/* ============================
   1. STORAGE MODULE
   ============================ */
const StorageModule = {
    key: 'smart_todo_tasks',
    
    getTasks() {
        try {
            const tasks = localStorage.getItem(this.key);
            return tasks ? JSON.parse(tasks) : [];
        } catch (e) {
            console.error("Error parsing tasks from storage:", e);
            return [];
        }
    },
    
    saveTasks(tasks) {
        localStorage.setItem(this.key, JSON.stringify(tasks));
    },

    getTheme() {
        return localStorage.getItem('smart_todo_theme') || 'light';
    },

    saveTheme(theme) {
        localStorage.setItem('smart_todo_theme', theme);
    },

    getNotifPref() {
        try {
            const pref = localStorage.getItem('smart_todo_notif');
            return pref === null ? true : JSON.parse(pref);
        } catch (e) {
            return true;
        }
    },

    saveNotifPref(isEnabled) {
        localStorage.setItem('smart_todo_notif', JSON.stringify(isEnabled));
    }
};

/* ============================
   2. NOTIFICATION MODULE
   ============================ */
const NotificationModule = {
    permission: 'default',
    audioContext: null,
    isEnabled: true,

    init() {
        if ("Notification" in window) {
            this.permission = Notification.permission;
        }
        this.isEnabled = StorageModule.getNotifPref();
    },

    toggle() {
        this.isEnabled = !this.isEnabled;
        StorageModule.saveNotifPref(this.isEnabled);
        return this.isEnabled;
    },

    async requestPermission() {
        if (!("Notification" in window)) {
            alert("Browser Anda tidak mendukung notifikasi.");
            return false;
        }

        const result = await Notification.requestPermission();
        this.permission = result;
        return result === 'granted';
    },

    playSound() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        const ctx = this.audioContext;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(500, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

        osc.start();
        osc.stop(ctx.currentTime + 0.5);
    },

    sendNotification(title, body) {
        if (this.permission === 'granted' && this.isEnabled) {
            this.playSound();
            new Notification(title, {
                body: body,
                icon: 'https://cdn-icons-png.flaticon.com/512/1024/1024824.png'
            });
        }
    },

    checkDeadlines(tasks) {
        if (this.permission !== 'granted' || !this.isEnabled) return;
        if (sessionStorage.getItem('notified_today')) return;

        const nearDueTasks = tasks.filter(t => {
            if (t.completed) return false;
            const status = UIModule.getDeadlineStatus(t.date, false);
            return status === 'near-due' || status === 'overdue';
        });

        if (nearDueTasks.length > 0) {
            const count = nearDueTasks.length;
            this.sendNotification(
                "Peringatan Tugas! ⏰", 
                `Ada ${count} tugas yang mendekati deadline atau terlambat. Segera cek listmu!`
            );
            sessionStorage.setItem('notified_today', 'true');
        }
    }
};

/* ============================
   3. AI MODULE (V2 CHATBOT)
   ============================ */
const AIModule = {
    chatHistory: [],

    SYSTEM_PROMPT: `
Kamu adalah AI Asisten Akademik Universal yang cerdas dan estetik.
Tugasmu adalah membantu pengguna menyelesaikan tugas akademik/pekerjaan dengan penjelasan langkah-demi-langkah.

FITUR ANALISIS FILE:
- Jika pengguna mengupload GAMBAR/PDF, kamu HARUS menganalisis visual/teks di dalamnya secara mendalam.
- Untuk soal matematika/sains: Jangan hanya beri kunci jawaban. Jelaskan metodologi penyelesaiannya step-by-step.
- Untuk dokumen teks: Ringkas poin utama atau jawab pertanyaan spesifik pengguna.

GAYA KOMUNIKASI:
- Gunakan Bahasa Indonesia yang luwes, ramah, dan profesional.
- Gunakan format Markdown (Bold, Lists, Code Blocks) agar mudah dibaca.
- Jadilah solutif dan menyemangati!
`,

    getKey() {
        // REPLACE THIS WITH YOUR REAL API KEY
        const HARDCODED_KEY = 'AIzaSyCYUGtSSirYtvd5HhY7bVAxDHHUFSp_wpg'; 
        return HARDCODED_KEY;
    },

    // saveKey removed as it is no longer needed

    initSession(task) {
        this.chatHistory = []; 
        
        let contextText = `[KONTEKS TUGAS]\nJudul: ${task.title}\nDeskripsi: ${task.desc || '-'}\n\nInstruksi: Pelajari detail tugas ini. Jika ada file lampiran, analisis isinya untuk membantu pengguna.`;
        
        let parts = [{ text: contextText }];

        if (task.file) {
             // Gemini 1.5 Flash supports PDF and Images natively via inline_data
             const supportedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv', 'text/html'];
             
             if (supportedTypes.includes(task.file.type)) {
                 // Clean base64 data
                 const base64Data = task.file.data.includes(',') ? task.file.data.split(',')[1] : task.file.data;
                 parts.push({
                     inline_data: {
                         mime_type: task.file.type,
                         data: base64Data
                     }
                 });
             } else {
                 parts[0].text += `\n[Info Sistem: File '${task.file.name}' (${task.file.type}) terlampir namun format ini mungkin perlu dibaca sebagai teks biasa jika memungkinkan.]`;
             }
        }

        this.chatHistory.push({
            role: 'user',
            parts: parts
        });
    },

    async sendMessage(userText = null) {
        const apiKey = this.getKey();
        if (!apiKey) throw new Error("API Key belum diset. Silakan atur di menu Pengaturan.");

        if (userText) {
            this.chatHistory.push({
                role: 'user',
                parts: [{ text: userText }]
            });
        }

        // Use 'gemini-2.5-flash' as requested
        const MODEL_NAME = 'gemini-2.5-flash'; 
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
        
        console.log("🤖 AI Request URL:", url); // DEBUG
        console.log("📦 AI Payload:", JSON.stringify({ contents: this.chatHistory })); // DEBUG

        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        const maxRetries = 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: this.chatHistory,
                        system_instruction: { parts: [{ text: this.SYSTEM_PROMPT }] }
                    })
                });

                console.log("📡 AI Response Status:", response.status); // DEBUG

                if (response.ok) {
                    const data = await response.json();
                    if (!data.candidates || data.candidates.length === 0) {
                         console.error("❌ AI Error: No candidates returned", data);
                         throw new Error("AI tidak memberikan respon (Empty Response).");
                    }
                    const reply = data.candidates[0].content.parts[0].text;
                    
                    this.chatHistory.push({
                        role: 'model',
                        parts: [{ text: reply }]
                    });

                    return reply;
                }

                const errData = await response.json();
                console.error("❌ AI API Error:", errData); // DEBUG
                
                const errMsg = errData.error?.message || `Status ${response.status}`;
                
                if (response.status === 400 && errMsg.includes('API key not valid')) {
                    throw new Error("API Key Invalid. Cek Pengaturan.");
                }

                if (response.status === 404) {
                    throw new Error("Model AI tidak ditemukan. Coba update API Key atau gunakan model lain.");
                }
                
                throw new Error(errMsg);

            } catch (error) {
                console.error("🔥 AI Fetch Error (Attempt " + attempt + "):", error);
                if (attempt === maxRetries) throw error;
                await wait(attempt * 2000); // Wait 2s, 4s, 6s...
            }
        }
    }
};

/* ============================
   4. TASK MODULE
   ============================ */
class Task {
    constructor(id, title, desc, date, priority, file = null, completed = false, createdAt = new Date()) {
        this.id = id;
        this.title = title;
        this.desc = desc;
        this.date = date; // YYYY-MM-DD
        this.priority = priority; 
        this.file = file; 
        this.completed = completed;
        this.createdAt = createdAt;
    }
}

const TaskModule = {
    tasks: [],

    init() {
        this.tasks = StorageModule.getTasks();
    },

    getAll() {
        return this.tasks;
    },

    add(title, desc, date, priority, file = null) {
        const newTask = new Task(
            Date.now().toString(),
            title,
            desc,
            date,
            priority,
            file
        );
        this.tasks.push(newTask);
        this.save();
        return newTask;
    },

    delete(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.save();
    },

    toggleStatus(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            this.save();
        }
    },

    edit(id, updatedData) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            Object.assign(task, updatedData);
            this.save();
        }
    },

    save() {
        StorageModule.saveTasks(this.tasks);
    },

    getStats() {
        const total = this.tasks.length;
        const completed = this.tasks.filter(t => t.completed).length;
        return {
            total,
            completed,
            pending: total - completed
        };
    },

    filterAndSort(filterType, sortType, searchQuery) {
        let filtered = [...this.tasks];

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(t => 
                t.title.toLowerCase().includes(q) || 
                t.desc.toLowerCase().includes(q)
            );
        }

        if (filterType === 'pending') {
            filtered = filtered.filter(t => !t.completed);
        } else if (filterType === 'completed') {
            filtered = filtered.filter(t => t.completed);
        }

        filtered.sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            if (sortType === 'date_asc') return new Date(a.date) - new Date(b.date);
            if (sortType === 'date_desc') return new Date(b.date) - new Date(a.date);
            
            const priorityVal = { high: 3, medium: 2, low: 1 };
            if (sortType === 'priority_desc') return priorityVal[b.priority] - priorityVal[a.priority];
            if (sortType === 'priority_asc') return priorityVal[a.priority] - priorityVal[b.priority];
            
            return 0;
        });

        return filtered;
    }
};

/* ============================
   5. UI MODULE
   ============================ */
const UIModule = {
    elements: {
        taskList: document.getElementById('task-list'),
        taskForm: document.getElementById('task-form'),
        emptyState: document.getElementById('empty-state'),
        themeToggle: document.getElementById('theme-toggle'),
        notifBtn: document.getElementById('notification-btn'),
        searchInput: document.getElementById('search-input'),
        sortSelect: document.getElementById('sort-select'),
        filterBtns: document.querySelectorAll('.filter-btn'),
        deleteModal: document.getElementById('delete-modal'),
        confirmDeleteBtn: document.getElementById('confirm-delete'),
        cancelDeleteBtn: document.getElementById('cancel-delete'),
        
        statTotal: document.getElementById('total-tasks'),
        statCompleted: document.getElementById('completed-tasks'),
        statPending: document.getElementById('pending-tasks'),
        progressText: document.getElementById('progress-text'),
        progressBarFill: document.getElementById('progress-bar-fill'),

        editModal: document.getElementById('edit-modal'),
        editForm: document.getElementById('edit-form'),
        editTitle: document.getElementById('edit-title'),
        editDesc: document.getElementById('edit-desc'),
        editDate: document.getElementById('edit-date'),
        editPriority: document.getElementById('edit-priority'),
        cancelEditBtn: document.getElementById('cancel-edit'),

        editPriority: document.getElementById('edit-priority'),
        cancelEditBtn: document.getElementById('cancel-edit'),

        // Settings elements removed

        aiConfirmModal: document.getElementById('ai-confirm-modal'),
        confirmAiBtn: document.getElementById('confirm-ai'),
        cancelAiBtn: document.getElementById('cancel-ai'),
        
        // V2 Chat Modals
        aiChatModal: document.getElementById('ai-chat-modal'),
        closeAiChatBtn: document.getElementById('close-ai-chat'),
        chatHistory: document.getElementById('chat-history'),
        chatForm: document.getElementById('chat-form'),
        chatInput: document.getElementById('chat-input'),
        chatTopic: document.getElementById('chat-topic'), // Fixed: Added missing element
        // V6 Advanced
        // Voice button removed
        
        // V8 File Feedback
        taskFile: document.getElementById('task-file'),
        fileFeedback: document.getElementById('file-feedback'),
        editFile: document.getElementById('edit-file'),
        editFileFeedback: document.getElementById('edit-file-feedback')
    },

    taskToDeleteId: null,
    taskToEditId: null,
    taskToAskAiId: null,

    init() {
        this.loadTheme();
        this.updateNotifIcon();
        this.renderStats();
        this.initSortable(); // Drag & Drop
    },

    initSortable() {
        if (typeof Sortable !== 'undefined') {
            Sortable.create(this.elements.taskList, {
                animation: 150,
                handle: '.cursor-move', // ONLY drag via the handle
                ghostClass: 'bg-indigo-50',
                onEnd: function(evt) {
                    // Reorder logic could go here if we persist order
                    console.log("Moved item", evt.from, evt.to);
                }
            });
        }
    },

    updateNotifIcon() {
        const icon = this.elements.notifBtn.querySelector('i');
        const isGranted = NotificationModule.permission === 'granted';
        const isEnabled = NotificationModule.isEnabled;

        if (isGranted) {
             this.elements.notifBtn.title = isEnabled ? "Matikan Notifikasi" : "Hidupkan Notifikasi";
             icon.className = isEnabled ? 'bx bx-bell' : 'bx bx-bell-off';
             if (isEnabled) {
                 this.elements.notifBtn.classList.add('bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-md');
                 this.elements.notifBtn.classList.remove('text-slate-500');
             } else {
                 this.elements.notifBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-md');
                 this.elements.notifBtn.classList.add('text-slate-500');
             }
        } else {
            this.elements.notifBtn.classList.remove('bg-white', 'dark:bg-slate-700', 'text-primary', 'shadow-md');
            icon.className = 'bx bx-bell-off';
            this.elements.notifBtn.title = "Izinkan Notifikasi";
        }
    },

    loadTheme() {
        const theme = StorageModule.getTheme();
        if (theme === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        this.updateThemeIcon(theme);
    },

    toggleTheme() {
        document.documentElement.classList.toggle('dark');
        const newTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        StorageModule.saveTheme(newTheme);
        this.updateThemeIcon(newTheme);
    },

    updateThemeIcon(theme) {
        const icon = this.elements.themeToggle.querySelector('i');
        icon.className = theme === 'light' ? 'bx bx-moon' : 'bx bx-sun';
    },

    getDeadlineStatus(dateString, isCompleted) {
        if (isCompleted) return '';
        const today = new Date();
        today.setHours(0,0,0,0);
        const due = new Date(dateString);
        due.setHours(0,0,0,0);
        const diffTime = due - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays < 0) return 'overdue';
        if (diffDays >= 0 && diffDays <= 2) return 'near-due';
        return '';
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const options = { weekday: 'short', day: 'numeric', month: 'short' };
        return new Date(dateString).toLocaleDateString('id-ID', options);
    },

    createTaskElement(task) {
        const li = document.createElement('li');
        const deadlineStatus = this.getDeadlineStatus(task.date, task.completed);
        
        // Professional Priority Badges
        const priorityConfig = {
            high: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', label: 'High' },
            medium: { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', label: 'Medium' },
            low: { badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', label: 'Low' }
        };
        const pConfig = priorityConfig[task.priority] || priorityConfig.medium;

        const statusClass = task.completed ? 'opacity-70 bg-slate-50 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900';
        const deadlineClass = deadlineStatus === 'overdue' ? 'border-l-4 border-l-red-500 border-y border-r border-slate-200 dark:border-slate-800' : (deadlineStatus === 'near-due' ? 'border-l-4 border-l-orange-500 border-y border-r border-slate-200 dark:border-slate-800' : 'border border-slate-200 dark:border-slate-800');

        // Main Card Styling
        li.className = `group relative p-4 rounded-xl shadow-sm ${deadlineClass} ${statusClass} flex gap-4 items-start transition-all duration-200 hover:shadow-md task-item`;
        li.dataset.id = task.id;

        let fileHtml = '';
        if (task.file) {
            fileHtml = `
                <div class="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg text-xs mt-2 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" onclick="window.open('${task.file.data}', '_blank')">
                    <i class='bx bx-file text-slate-500'></i>
                    <span class="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title="${task.file.name}">${task.file.name}</span>
                </div>
            `;
        }

        li.innerHTML = `
            <!-- Drag Handle -->
            <div class="cursor-move text-slate-300 hover:text-slate-500 dark:text-slate-700 dark:hover:text-slate-500 flex flex-col justify-center h-full pt-1">
                <i class='bx bx-grid-vertical text-xl'></i>
            </div>
            
            <!-- Checkbox -->
            <div class="pt-1">
                <label class="flex items-center cursor-pointer relative">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} class="peer sr-only status-checkbox">
                    <div class="w-6 h-6 bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg peer-checked:bg-indigo-600 peer-checked:border-indigo-600 transition-all flex items-center justify-center text-white peer-checked:scale-110">
                        <i class='bx bx-check text-base transform scale-0 peer-checked:scale-100 transition-transform'></i>
                    </div>
                </label>
            </div>
            
            <!-- Content -->
            <div class="flex-1 w-full min-w-0 flex flex-col gap-1">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                         <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${pConfig.badge}">${pConfig.label}</span>
                         ${deadlineStatus === 'overdue' ? '<span class="text-xs font-bold text-red-500 flex items-center gap-0.5"><i class="bx bx-error-circle"></i> Late</span>' : ''}
                    </div>
                    
                    <!-- Management Actions (Top Right) -->
                    <div class="flex items-center gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button class="edit-btn p-1.5 rounded-lg text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Edit"><i class='bx bx-edit-alt text-lg'></i></button>
                        <button class="delete-btn p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors" title="Delete"><i class='bx bx-trash text-lg'></i></button>
                    </div>
                </div>
                
                <h3 class="font-bold text-base text-slate-800 dark:text-slate-100 leading-snug ${task.completed ? 'line-through text-slate-400' : ''}">${task.title}</h3>
                ${task.desc ? `<p class="text-slate-500 dark:text-slate-400 text-sm leading-relaxed line-clamp-2">${task.desc}</p>` : ''}
                ${fileHtml}
                
                <!-- Bottom Meta & AI Action -->
                <div class="flex items-center gap-4 mt-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                     <span class="text-xs text-slate-400 font-medium flex items-center gap-1">
                        <i class='bx bx-calendar'></i> ${this.formatDate(task.date)}
                    </span>
                    
                    <button class="btn-ai ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 transition-colors">
                        <i class='bx bx-bot'></i> Tanya AI
                    </button>
                </div>
            </div>
        `;
        
        return li;
    },

    toggleModal(modal, show) {
        if (show) {
            modal.classList.remove('hidden');
            // Small delay to allow display:block to apply before opacity transition
            setTimeout(() => {
                modal.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
                modal.classList.add('opacity-100', 'pointer-events-auto', 'scale-100');
            }, 10);
        } else {
            modal.classList.remove('opacity-100', 'pointer-events-auto', 'scale-100');
            modal.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
            
            // Wait for transition to finish before hiding
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 300);
        }
    },

    renderList(tasks) {
        this.elements.taskList.innerHTML = '';
        if (tasks.length === 0) {
            this.elements.emptyState.classList.remove('hidden');
        } else {
            this.elements.emptyState.classList.add('hidden');
            tasks.forEach(task => {
                this.elements.taskList.appendChild(this.createTaskElement(task));
            });
        }
        this.renderStats();
    },

    renderStats() {
        const stats = TaskModule.getStats();
        this.elements.statTotal.textContent = stats.total;
        this.elements.statCompleted.textContent = stats.completed;
        this.elements.statPending.textContent = stats.pending;
        
        const percentage = stats.total === 0 ? 0 : Math.round((stats.completed / stats.total) * 100);
        this.elements.progressText.textContent = `${percentage}%`;
        this.elements.progressBarFill.style.width = `${percentage}%`;
    },

    updateFilterBtnStyles(activeFilter) {
        this.elements.filterBtns.forEach(btn => {
            if (btn.dataset.filter === activeFilter) {
                // Active: Dark BG (Light Node), White Text
                btn.className = 'filter-btn active px-5 py-2 rounded-xl text-sm font-bold text-white bg-slate-800 dark:bg-white dark:text-slate-900 shadow-sm transition-all transform scale-105';
            } else {
                // Inactive: Text Gray
                btn.className = 'filter-btn px-5 py-2 rounded-xl text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-all hover:bg-slate-100 dark:hover:bg-slate-700';
            }
        });
    },

    updateFileFeedback(input, feedbackEl, defaultText = "Upload File (Max 2MB)") {
        if (input.files && input.files[0]) {
            // File Selected
            const file = input.files[0];
            feedbackEl.className = "w-full p-3 rounded-xl border border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center gap-2 transition-colors";
            feedbackEl.innerHTML = `<i class='bx bx-check-circle text-xl'></i> <span class="text-sm font-bold truncate max-w-[200px]">${file.name}</span>`;
        } else {
            // No File / Reset
            feedbackEl.className = "w-full p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 group-hover:bg-slate-100 dark:group-hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-slate-500";
            feedbackEl.innerHTML = `<i class='bx bx-cloud-upload text-xl'></i> <span class="text-sm font-medium">${defaultText}</span>`;
        }
    },

    showDeleteModal(id) {
        this.taskToDeleteId = id;
        this.toggleModal(this.elements.deleteModal, true);
    },

    hideDeleteModal() {
        this.taskToDeleteId = null;
        this.toggleModal(this.elements.deleteModal, false);
    },

    showEditModal(task) {
        this.taskToEditId = task.id;
        this.elements.editTitle.value = task.title;
        this.elements.editDesc.value = task.desc || '';
        this.elements.editDate.value = task.date;
        this.elements.editPriority.value = task.priority;
        
        const fileInfo = document.getElementById('current-file-info');
        if (task.file) {
            fileInfo.innerHTML = `File saat ini: <strong>${task.file.name}</strong>`;
        } else {
            fileInfo.textContent = 'Tidak ada file terlampir.';
        }
        document.getElementById('edit-file').value = ''; 
        this.toggleModal(this.elements.editModal, true);
    },

    hideEditModal() {
        this.taskToEditId = null;
        this.toggleModal(this.elements.editModal, false);
    },
    
    getEditFormElements() {
        return {
           title: this.elements.editTitle.value,
           desc: this.elements.editDesc.value,
           date: this.elements.editDate.value,
           priority: this.elements.editPriority.value,
           fileInput: document.getElementById('edit-file')
        };
    },

    // AI & Settings Modals - Settings methods removed
    showAiConfirmModal(taskId) {
        this.taskToAskAiId = taskId;
        this.toggleModal(this.elements.aiConfirmModal, true);
    },
    hideAiConfirmModal() {
        this.taskToAskAiId = null;
        this.toggleModal(this.elements.aiConfirmModal, false);
    },

    // V2 Chat Methods
    showAiChatModal(task) {
        this.elements.chatTopic.textContent = `Topik: ${task.title}`;
        this.elements.chatHistory.innerHTML = ''; 
        this.toggleModal(this.elements.aiChatModal, true);
        // Initial AI greeting is handled by initSession result or manual append
        this.appendMessage('ai', `Halo! 👋 Saya siap membantu Anda mengerjakan tugas **"${task.title}"**.\nApa yang bisa saya jelaskan?`);
    },

    hideAiChatModal() {
        this.toggleModal(this.elements.aiChatModal, false);
    },

    appendMessage(sender, text) {
        const div = document.createElement('div');
        const isUser = sender === 'user';
        
        div.className = `max-w-[85%] p-5 rounded-3xl text-sm leading-7 shadow-sm relative transition-all duration-300 ${isUser ? 'bg-gradient-to-br from-primary to-indigo-600 text-white self-end rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 self-start rounded-bl-sm border border-slate-100 dark:border-slate-700 shadow-card'}`;
        
        if (!isUser) {
            div.className += ' markdown-body prose prose-sm dark:prose-invert max-w-none';
            div.innerHTML = marked.parse(text); 
        } else {
            div.textContent = text;
        }

        this.elements.chatHistory.appendChild(div);
        this.scrollToBottom();
    },

    scrollToBottom() {
        this.elements.chatHistory.scrollTop = this.elements.chatHistory.scrollHeight;
    },

    // Toast Notification System
    showToast(message, type = 'success') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container fixed bottom-8 right-8 flex flex-col gap-4 z-50 pointer-events-none';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        
        const colors = {
            success: 'bg-white dark:bg-slate-800 border-l-[6px] border-green-500',
            error: 'bg-white dark:bg-slate-800 border-l-[6px] border-red-500',
            info: 'bg-white dark:bg-slate-800 border-l-[6px] border-blue-500'
        };

        toast.className = `pointer-events-auto min-w-[340px] p-5 rounded-2xl shadow-2xl border border-white/50 dark:border-slate-700/50 backdrop-blur-xl transform transition-all duration-500 translate-x-full opacity-0 flex items-start gap-4 ${colors[type] || colors.info}`;
        
        requestAnimationFrame(() => {
            toast.classList.remove('translate-x-full', 'opacity-0');
            toast.classList.add('translate-x-0', 'opacity-100');
        });

        const iconMap = {
            success: 'bx-check-circle text-green-500',
            error: 'bx-x-circle text-red-500',
            info: 'bx-info-circle text-blue-500'
        };

        const titleMap = {
            success: 'Berhasil!',
            error: 'Ups, Gagal!',
            info: 'Informasi'
        };

        toast.innerHTML = `
            <div class="text-2xl mt-0.5"><i class='bx ${iconMap[type] || 'bx-info-circle'}'></i></div>
            <div class="flex-1">
                <div class="font-bold text-base text-slate-800 dark:text-white mb-1 leading-none">${titleMap[type]}</div>
                <div class="text-sm text-slate-500 dark:text-slate-400 leading-snug">${message}</div>
            </div>
            <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 transition-colors"><i class='bx bx-x text-xl'></i></button>
        `;

        container.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('translate-x-0', 'opacity-100');
            toast.classList.add('translate-x-full', 'opacity-0');
            toast.addEventListener('transitionend', () => {
                toast.remove();
                if (container.children.length === 0) container.remove();
            });
        }, 5000);
    }
};

/* ============================
   6. APP CONTROLLER
   ============================ */
const App = {
    state: {
        filter: 'all', 
        sort: 'date_asc', 
        search: ''
    },

    init() {
        TaskModule.init();
        NotificationModule.init();
        UIModule.init();
        
        if (NotificationModule.permission === 'granted') {
            NotificationModule.checkDeadlines(TaskModule.getAll());
        }

        document.getElementById('task-date').valueAsDate = new Date();

        this.bindEvents();
        this.refreshList();
    },

    bindEvents() {
        // Notification
        UIModule.elements.notifBtn.addEventListener('click', async () => {
            if (NotificationModule.permission !== 'granted') {
                const granted = await NotificationModule.requestPermission();
                if (granted) {
                    if (!NotificationModule.isEnabled) NotificationModule.toggle(); 
                    UIModule.updateNotifIcon();
                    NotificationModule.playSound();
                    NotificationModule.checkDeadlines(TaskModule.getAll());
                }
            } else {
                NotificationModule.toggle();
                UIModule.updateNotifIcon();
                if (NotificationModule.isEnabled) NotificationModule.playSound();
            }
        });

        // Settings events removed
        
        // AI Confirmation -> START CHAT
        UIModule.elements.cancelAiBtn.addEventListener('click', () => {
            UIModule.hideAiConfirmModal();
        });

        UIModule.elements.confirmAiBtn.addEventListener('click', async () => {
             const taskId = UIModule.taskToAskAiId;
             if (!taskId) return;

             const task = TaskModule.getAll().find(t => t.id === taskId);
             if (!task) return;

             UIModule.hideAiConfirmModal();
             
             // Open Chat Modal & Init Session
             UIModule.showAiChatModal(task);
             AIModule.initSession(task);
             
             // Trigger first analysis in background
             const loadingId = 'loading-initial';
             const loadingDiv = document.createElement('div');
             loadingDiv.id = loadingId;
             loadingDiv.className = 'max-w-[85%] p-5 rounded-3xl bg-white dark:bg-slate-800 text-slate-500 self-start rounded-bl-sm border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-2';
             loadingDiv.innerHTML = '<div class="typing-indicator flex gap-1"><span class="w-2 h-2 bg-primary rounded-full animate-bounce"></span><span class="w-2 h-2 bg-primary ms-1 rounded-full animate-bounce" style="animation-delay: 0.2s"></span><span class="w-2 h-2 bg-primary ms-1 rounded-full animate-bounce" style="animation-delay: 0.4s"></span></div><span class="text-xs">Sedang membaca detail tugas...</span>';
             UIModule.elements.chatHistory.appendChild(loadingDiv);
             
             try {
                const answer = await AIModule.sendMessage(null); // Send context only
                
                const el = document.getElementById(loadingId);
                if(el) el.remove();
                
                UIModule.appendMessage('ai', answer);
             } catch (err) {
                const el = document.getElementById(loadingId);
                if(el) el.remove();
                UIModule.appendMessage('ai', `**AI Gagal Memulai.** ⚠️\n\nError: *${err.message}*\n\n**Solusi:**\n1. Cek koneksi internet.\n2. Pastikan API Key di Pengaturan sudah benar dan valid.\n3. Coba refresh halaman.`);
             }
        });


        
        UIModule.elements.closeAiChatBtn.addEventListener('click', () => {
            UIModule.hideAiChatModal();
        });

        // AI Chat Form Listener
        UIModule.elements.chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const text = UIModule.elements.chatInput.value.trim();
            if (!text) return;

            UIModule.appendMessage('user', text);
            UIModule.elements.chatInput.value = '';

            // Loading indicator
            const loadingDiv = document.createElement('div');
            loadingDiv.id = 'ai-loading';
            loadingDiv.className = 'max-w-[85%] p-5 rounded-3xl bg-white dark:bg-slate-800 text-slate-500 self-start rounded-bl-sm border border-slate-100 dark:border-slate-700 shadow-sm flex items-center gap-2';
            loadingDiv.innerHTML = '<i class="bx bx-loader-alt animate-spin text-primary"></i> Sedang mengetik...';
            UIModule.elements.chatHistory.appendChild(loadingDiv);
            UIModule.scrollToBottom();

            try {
                const reply = await AIModule.sendMessage(text);
                loadingDiv.remove();
                UIModule.appendMessage('ai', reply);
            } catch (err) {
                loadingDiv.remove();
                UIModule.appendMessage('ai', `**Error:** ${err.message}`);
            }
        });

        // File Reader Helper
        const readFile = (file) => {
            return new Promise((resolve, reject) => {
                if (!file) {
                    resolve(null);
                    return;
                }
                if (file.size > 2 * 1024 * 1024) { 
                    alert("File terlalu besar! Maksimal 2MB.");
                    resolve('error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = () => resolve({
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    data: reader.result
                });
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        };



        // Voice Command Event Removed

        // File Input Feedback
        UIModule.elements.taskFile.addEventListener('change', () => {
             UIModule.updateFileFeedback(UIModule.elements.taskFile, UIModule.elements.fileFeedback);
        });

        if (UIModule.elements.editFile) {
            UIModule.elements.editFile.addEventListener('change', () => {
                 UIModule.updateFileFeedback(UIModule.elements.editFile, UIModule.elements.editFileFeedback, "Ganti File (Max 2MB)");
            });
        }

        // Task Management Events
        UIModule.elements.taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('task-title').value;
            const desc = document.getElementById('task-desc').value;
            const date = document.getElementById('task-date').value;
            const priority = document.getElementById('task-priority').value;
            const fileInput = document.getElementById('task-file');
            
            if (title && date) {
                // ... processing ...
                
                let fileData = null;
                if (fileInput.files.length > 0) {
                     fileData = await readFile(fileInput.files[0]);
                     if (fileData === 'error') return;
                }

                TaskModule.add(title, desc, date, priority, fileData);
                NotificationModule.checkDeadlines();
                
                // Ensure new task is visible
                App.state.filter = 'all'; 
                UIModule.elements.filterBtns.forEach(b => b.classList.remove('active'));
                document.querySelector('[data-filter="all"]').classList.add('active');
                
                App.refreshList(); // Fixed: Was UIModule.refreshList()
                e.target.reset();
                
                // Reset File Feedback
                UIModule.updateFileFeedback(fileInput, UIModule.elements.fileFeedback);
                
                UIModule.showToast('Tugas berhasil dibuat!', 'success');
            } else {
                UIModule.showToast('Judul dan Tanggal wajib diisi.', 'error');
                // Shake animation for form
                UIModule.elements.taskForm.classList.add('shake-animation');
                setTimeout(() => UIModule.elements.taskForm.classList.remove('shake-animation'), 400);
            }
        });

        UIModule.elements.themeToggle.addEventListener('click', () => {
            UIModule.toggleTheme();
        });

        UIModule.elements.searchInput.addEventListener('input', (e) => {
            this.state.search = e.target.value;
            this.refreshList();
        });

        UIModule.elements.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                UIModule.elements.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.state.filter = btn.dataset.filter;
                this.refreshList();
            });
        });

        UIModule.elements.sortSelect.addEventListener('change', (e) => {
            this.state.sort = e.target.value;
            this.refreshList();
        });

        // Task List Delegation
        UIModule.elements.taskList.addEventListener('click', (e) => {
            const item = e.target.closest('.task-item');
            if (!item) return;
            const id = item.dataset.id;

            if (e.target.closest('.delete-btn')) {
                UIModule.showDeleteModal(id);
                return;
            }
            
            if (e.target.closest('.edit-btn')) {
                const task = TaskModule.getAll().find(t => t.id === id);
                if (task) {
                    UIModule.showEditModal(task);
                }
                return;
            }
            
            if (e.target.closest('.btn-ai')) {
                // Key is now hardcoded, no need to check or alert
                UIModule.showAiConfirmModal(id);
                return;
            }

            if (e.target.classList.contains('status-checkbox')) {
                if (e.target.checked && NotificationModule.isEnabled) NotificationModule.playSound();
                TaskModule.toggleStatus(id);
                // Increased delay to 800ms so user sees the check animation before it moves
                setTimeout(() => {
                    this.refreshList();
                }, 800); 
            }
        });

        // Modal Action Events
        UIModule.elements.cancelDeleteBtn.addEventListener('click', () => {
            UIModule.hideDeleteModal();
        });

        UIModule.elements.confirmDeleteBtn.addEventListener('click', () => {
            if (UIModule.taskToDeleteId) {
                TaskModule.delete(UIModule.taskToDeleteId);
                UIModule.hideDeleteModal();
                this.refreshList();
            }
        });

        UIModule.elements.cancelEditBtn.addEventListener('click', () => {
            UIModule.hideEditModal();
        });

        UIModule.elements.editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (UIModule.taskToEditId) {
                const formData = UIModule.getEditFormElements();
                const fileInput = formData.fileInput;
                
                let updatedData = {
                    title: formData.title,
                    desc: formData.desc,
                    date: formData.date,
                    priority: formData.priority
                };

                if (fileInput.files.length > 0) {
                     const fileData = await readFile(fileInput.files[0]);
                     if (fileData === 'error') return;
                     updatedData.file = fileData;
                }

                TaskModule.edit(UIModule.taskToEditId, updatedData);
                UIModule.hideEditModal();
                this.refreshList();
            }
        });
    },

    refreshList() {
        const tasks = TaskModule.filterAndSort(this.state.filter, this.state.sort, this.state.search);
        UIModule.renderList(tasks);
    }
};

// Start App
document.addEventListener('DOMContentLoaded', () => {
    App.init();
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
        .then(reg => console.log('SW registered!', reg))
        .catch(err => console.log('SW failed', err));
    }
});
