// firebase-backend.js
// This file coordinates the transition from localStorage to Firebase Cloud Backend

// 1. Firebase Configuration (User must replace these with their own keys)
const firebaseConfig = {
    apiKey: "AIzaSyCH4VYJZ0gb8mdSAbxgA_1OdBfpRf4HmAM",
    authDomain: "nomina-pedropi.firebaseapp.com",
    projectId: "nomina-pedropi",
    storageBucket: "nomina-pedropi.firebasestorage.app",
    messagingSenderId: "153274946528",
    appId: "1:153274946528:web:29f9df992ad6eb30de9185"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    const db = firebase.firestore();
    // 2. Add User Management Logic (No Firebase Auth)
    window.registerSecondaryUser = async (email, password, name, role, allowedModules = [], allowedDepartments = [], canCreateEmployees = false) => {
        try {
            // Generar un UID simple localmente
            const uid = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2);

            // Save the user data locally and in Firestore (incluyendo contraseña para validación interna)
            const newUser = {
                uid: uid,
                email: email,
                password: password, // Almacenamiento interno simple
                name: name,
                role: role,
                allowedModules: allowedModules,
                allowedDepartments: allowedDepartments || [],
                canCreateEmployees: canCreateEmployees,
                createdAt: new Date().toISOString()
            };

            await db.collection('users').doc(uid).set(newUser);

            // Actualizar estado global inmediatamente
            if (!window.globalState.users) window.globalState.users = [];
            window.globalState.users.push(newUser);

            alert(`Usuario ${name} creado exitosamente como ${role}.`);
        } catch (error) {
            console.error("Error creating user:", error);
            alert("Error al crear usuario: " + error.message);
        }
    };

    window.updateUserAccess = async (uid, updatedData) => {
        try {
            await db.collection('users').doc(uid).update(updatedData);

            // Update local state instantly so UI reflects the change without waiting for snapshot
            if (window.globalState.users) {
                const index = window.globalState.users.findIndex(u => u.uid === uid);
                if (index !== -1) {
                    window.globalState.users[index] = { ...window.globalState.users[index], ...updatedData };
                }
            }
            alert("Usuario actualizado correctamente.");
        } catch (error) {
            console.error("Error updating user:", error);
            alert("Error al editar usuario: " + error.message);
        }
    };

    window.removeUserAccess = async (uid) => {
        try {
            await db.collection('users').doc(uid).update({ role: 'disabled' });
            alert("Acceso revocado. El usuario ya no podrá realizar acciones.");
        } catch (error) {
            console.error("Error removing user:", error);
            alert("Error al revocar acceso.");
        }
    };

    // DOM Elements (Login overlay removed by user request)
    const mainApp = document.getElementById('main-app');

    // Handle Internal Login State
    const initApp = (user) => {
        document.getElementById('login-overlay').style.display = 'none';
        document.getElementById('main-app').style.display = 'flex';

        window.globalState.currentUser = user;
        sessionStorage.setItem('activeSession', JSON.stringify(user));

        // Apply UI permissions based on Role and allowedModules
        const applyRolePermissions = (user) => {
            const role = user.role;
            const allowedModules = user.allowedModules || [];

            const sidebar = document.querySelector('.sidebar-nav ul');
            if (sidebar) {
                const elements = Array.from(sidebar.children);
                let currentHeader = null;
                let headerHasVisibleItems = false;

                elements.forEach(el => {
                    if (el.classList.contains('nav-header')) {
                        if (currentHeader) {
                            currentHeader.style.display = (role === 'admin' || headerHasVisibleItems) ? 'block' : 'none';
                        }
                        currentHeader = el;
                        headerHasVisibleItems = false;
                    } else if (el.classList.contains('nav-item')) {
                        const section = el.getAttribute('data-section');
                        if (!section) return; // Skip logout or items without section

                        let isVisible = false;
                        if (role === 'admin') {
                            isVisible = true;
                        } else {
                            if (section === 'users') {
                                isVisible = false;
                            } else if (allowedModules.length > 0) {
                                isVisible = allowedModules.includes(section);
                            } else {
                                isVisible = true;
                            }
                        }

                        el.style.display = isVisible ? 'block' : 'none';
                        if (isVisible) headerHasVisibleItems = true;
                    }
                });

                if (currentHeader) {
                    currentHeader.style.display = (role === 'admin' || headerHasVisibleItems) ? 'block' : 'none';
                }
            }

            // Hide reset button container for non-admins
            const wipeBtn = document.getElementById('temp-wipe-btn');
            if (wipeBtn) {
                wipeBtn.parentElement.style.display = (role === 'admin') ? 'block' : 'none';
            }

            document.body.classList.remove('role-admin', 'role-editor', 'role-viewer');
            document.body.classList.add(`role-${role}`);
        };
        applyRolePermissions(user);

        // Trigger remote state loading
        window.loadStateFromFirebase();
    };

    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        const loginError = document.getElementById('login-error');

        // Verificar sesión activa (Solo en esta pestaña/ventana)
        const savedSession = sessionStorage.getItem('activeSession');
        if (savedSession) {
            initApp(JSON.parse(savedSession));
        }

        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('login-email').value.trim();
                const password = document.getElementById('login-password').value;
                loginError.classList.add('hidden');

                // Validar Credenciales Internamente
                const safeEmail = email.toLowerCase();
                if (safeEmail === 'admin' && password === 'admin') {
                    // Superadmin por defecto
                    console.log("Acceso admin por defecto concedido");
                    initApp({ uid: 'local-admin-override', email: email, role: 'admin', name: 'Administrador Principal' });
                    return;
                }

                try {
                    // Validar contra Firebase Firestore usuarios (ignorando mayúsculas/minúsculas)
                    console.log("Intentando ingresar con el usuario:", safeEmail);
                    const usersRef = await db.collection('users').get();

                    let validUser = null;
                    let userFound = false;

                    usersRef.forEach(doc => {
                        const userData = doc.data();
                        const docEmail = userData.email || userData.username || ''; // Fallback for safety

                        if (docEmail.toLowerCase() === safeEmail) {
                            userFound = true;
                            if (userData.password === password && userData.role !== 'disabled') {
                                validUser = userData;
                            }
                        }
                    });

                    if (!userFound) {
                        console.warn("Usuario no encontrado en la base de datos.");
                        loginError.textContent = 'Usuario no encontrado';
                        loginError.classList.remove('hidden');
                        return;
                    }

                    if (validUser) {
                        console.log("Login exitoso. Iniciando App...");
                        initApp(validUser);
                    } else {
                        console.warn("Contraseña incorrecta o rol deshabilitado.");
                        loginError.textContent = 'Contraseña incorrecta o usuario inactivo';
                        loginError.classList.remove('hidden');
                    }
                } catch (err) {
                    console.error("Error validando el login contra Firebase:", err);
                    loginError.textContent = 'Error de conexión a la base de datos: ' + err.message;
                    loginError.classList.remove('hidden');
                }
            });
        }

        // Add logout button to the sidebar
        const sidebarNav = document.querySelector('.sidebar-nav ul');
        if (sidebarNav) {
            const logoutLi = document.createElement('li');
            logoutLi.className = 'nav-item';
            logoutLi.innerHTML = '<i class="fas fa-sign-out-alt"></i> <span>Cerrar Sesión</span>';
            logoutLi.style.marginTop = 'auto';
            logoutLi.style.color = '#ff6b6b';
            logoutLi.onclick = () => {
                sessionStorage.removeItem('activeSession');
                window.location.reload();
            };
            sidebarNav.appendChild(logoutLi);
        }
    });

    // Cloud Database Methods
    let isInitialLoad = true;
    window.isFirebaseStateLoaded = false;

    window.loadStateFromFirebase = () => {
        console.log("Listening for real-time changes from Firebase...");

        const docRef = db.collection('payroll').doc('globalState');

        docRef.onSnapshot((doc) => {
            console.log("[FIREBASE SNAPSHOT RECEIVED]", doc.exists ? "Data exists" : "No data");
            if (doc.exists) {
                const data = doc.data();
                console.log("[FIREBASE SNAPSHOT DATA LENGTHS:", Object.keys(data).map(k => `${k}: ${data[k]?.length || typeof data[k]}`).join(', '));

                // --- INCOMING DELTA CALCULATION ---
                // Only overwrite local state if the cloud actually changed that specific module.
                // This prevents wiping out a user's local unsaved changes in one module
                // when a snapshot arrives because someone else modified a different module.
                const cloudChanges = {};
                Object.keys(data).forEach(key => {
                    const lastKnown = window._lastCloudState ? window._lastCloudState[key] : undefined;
                    if (JSON.stringify(lastKnown) !== JSON.stringify(data[key])) {
                        cloudChanges[key] = true;
                    }
                });

                Object.keys(data).forEach(key => {
                    // Do not overwrite users array from globalState doc, it comes from users collection
                    // ALSO: Ignore payrollHistory from globalState if we are using the new collection
                    if (key !== 'users' && key !== 'payrollHistory' && window.globalState.hasOwnProperty(key)) {

                        // ONLY apply if it's the first load OR if this specific module changed in the cloud
                        if (isInitialLoad || cloudChanges[key]) {
                            // Protect against null/undefined cloud fields overwriting valid local arrays
                            if (data[key] !== undefined && data[key] !== null) {
                                if (Array.isArray(window.globalState[key]) && Array.isArray(data[key])) {
                                    // Important: Protect rich local data from being wiped by an empty cloud state
                                    // If cloud is empty but local has data during initial load, WE SHOULD NOT OVERWRITE
                                    if (isInitialLoad && data[key].length === 0 && window.globalState[key].length > 0) {
                                        console.warn(`[SYNC PROTECT] La base de datos en la nube para '${key}' está vacía. Restaurando desde la memoria local (${window.globalState[key].length} elementos)...`);

                                        if (!window._restorationAlertShown) {
                                            window._restorationAlertShown = true;
                                            alert("ℹ️ Sistema: Se han restaurado tus datos locales porque la base de datos en la nube estaba vacía.\n\nSi tu intención era borrar todo, por favor usa el botón 'Limpiar Sistema' en el Dashboard para una limpieza completa.");
                                        }

                                        // Trigger a save so the cloud gets our rich local data
                                        setTimeout(() => {
                                            console.log(`[SYNC PROTECT] Subiendo datos de '${key}' a la nube para evitar pérdida de información.`);
                                            window.saveStateToFirebase();
                                        }, 2000);
                                    } else {
                                        // Standard Sync: Smart Array Merge for Concurrency
                                        const merged = [...data[key]];
                                        const cloudIds = new Set(data[key].map(i => String(i.id)).filter(id => id !== "undefined" && id !== "null"));
                                        const lastCloudIds = new Set((window._lastCloudState && window._lastCloudState[key] ? window._lastCloudState[key] : []).map(i => String(i.id)).filter(id => id !== "undefined" && id !== "null"));

                                        window.globalState[key].forEach(localItem => {
                                            if (localItem.id && !cloudIds.has(String(localItem.id))) {
                                                // Missing from Cloud. But did we create it locally recently, or was it deleted remotely?
                                                if (!lastCloudIds.has(String(localItem.id))) {
                                                    // We created it locally! Preserve it.
                                                    merged.push(localItem);
                                                }
                                            }
                                        });

                                        // REVERSED LOGIC: If item is in Cloud but NOT in Local, should we keep it?
                                        // ONLY if it's NEW to the cloud (not in lastCloudIds).
                                        // If it was in lastCloudIds and we deleted it locally, we should REMOVE it from the merged result
                                        // so it doesn't reappear, and then saveStateToFirebase will eventually remove it from cloud.
                                        const finalMerged = [];
                                        merged.forEach(item => {
                                            const itemIdStr = item && item.id ? String(item.id) : null;
                                            if (!itemIdStr) {
                                                finalMerged.push(item);
                                                return;
                                            }

                                            const inLocal = window.globalState[key].find(l => String(l.id) === itemIdStr);
                                            const inLastCloud = lastCloudIds.has(itemIdStr);

                                            if (!inLocal && inLastCloud) {
                                                // It was in our last cloud sync, but it's gone from local. 
                                                // This means WE deleted it. Do not restore it.
                                                console.log(`[SYNC] Ignoring restoration of deleted item: ${itemIdStr} in ${key}`);
                                            } else {
                                                finalMerged.push(item);
                                            }
                                        });

                                        // Special Deep Merge for activePayrolls to protect dailyLogs concurrency
                                        if (key === 'activePayrolls') {
                                            finalMerged.forEach(cloudPayroll => {
                                                const cloudPayrollIdStr = String(cloudPayroll.id);
                                                const localPayroll = (window.globalState.activePayrolls || []).find(p => String(p.id) === cloudPayrollIdStr);
                                                if (localPayroll) {
                                                    const localLogs = localPayroll.dailyLogs || [];
                                                    const cloudLogs = cloudPayroll.dailyLogs || [];
                                                    const lastCloudPayroll = (window._lastCloudState && window._lastCloudState.activePayrolls) ? window._lastCloudState.activePayrolls.find(p => String(p.id) === cloudPayrollIdStr) : null;
                                                    const lastCloudLogs = (lastCloudPayroll && lastCloudPayroll.dailyLogs) ? lastCloudPayroll.dailyLogs : [];
                                                    const lastCloudLogIds = new Set(lastCloudLogs.map(l => String(l.id)).filter(Boolean));

                                                    const mergedLogs = [...cloudLogs];
                                                    const cloudLogIds = new Set(cloudLogs.map(l => String(l.id)).filter(Boolean));

                                                    // 1. Preserve local logs not yet in cloud
                                                    localLogs.forEach(localLog => {
                                                        const localLogIdStr = String(localLog.id);
                                                        if (localLog.id && !cloudLogIds.has(localLogIdStr) && !lastCloudLogIds.has(localLogIdStr)) {
                                                            mergedLogs.push(localLog);
                                                        }
                                                    });

                                                    // 2. Filter out logs we deleted locally
                                                    cloudPayroll.dailyLogs = mergedLogs.filter(log => {
                                                        if (!log.id) return true;
                                                        const logIdStr = String(log.id);
                                                        const inLocalLogs = localLogs.find(l => String(l.id) === logIdStr);
                                                        const wasInCloud = lastCloudLogIds.has(logIdStr);
                                                        if (!inLocalLogs && wasInCloud) {
                                                            console.log(`[SYNC] Preventing reappearance of deleted log: ${logIdStr}`);
                                                            return false;
                                                        }
                                                        return true;
                                                    });
                                                }
                                            });
                                        }

                                        window.globalState[key].length = 0;
                                        finalMerged.forEach(item => window.globalState[key].push(item));
                                    }
                                } else {
                                    window.globalState[key] = data[key];
                                    if (window.state && window.state !== window.globalState) {
                                        window.state[key] = data[key];
                                    }
                                }
                            }
                        } // Close: if (isInitialLoad || cloudChanges[key])
                    }
                });

                // --- NEW: History Collection Migration & Sync ---
                if (data.payrollHistory && data.payrollHistory.length > 0) {
                    console.log(`[MIGRATION] Found ${data.payrollHistory.length} items in globalState. Moving to history collection...`);
                    data.payrollHistory.forEach(async (run) => {
                        await window.savePayrollToHistory(run);
                    });
                    // After migrating, we should remove it from globalState to save space
                    db.collection('payroll').doc('globalState').update({
                        payrollHistory: firebase.firestore.FieldValue.delete()
                    });
                }

                window.isFirebaseStateLoaded = true;

                // Keep a baseline of what the cloud has, so we can calculate deltas
                window._lastCloudState = JSON.parse(JSON.stringify(data));

                // Immediately burn the fresh cloud data into the offline local storage cache
                if (typeof window.syncToLocalStorage === 'function') {
                    console.log("[SYNC] Burning cloud data into local offline storage");
                    window.syncToLocalStorage();
                }

                // If this is the initial login load, render the full dashboard
                if (isInitialLoad) {
                    window.renderSection(window.globalState.currentSection || 'dashboard');
                    isInitialLoad = false;
                } else {
                    // It's a background sync update.
                    // PROTECTION: Do not re-render if the user is currently typing in an input or select
                    const activeEl = document.activeElement;
                    const isUserTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA');

                    if (isUserTyping) {
                        console.log("[SYNC] User is typing. Skipping destructive re-render to protect uncommitted data.");
                        return;
                    }

                    if (window.globalState.currentSection === 'daily-registration' || window.globalState.currentSection === 'dashboard' || window.globalState.currentSection === 'reports') {
                        // Rerendering the whole section usually wipes inputs.
                        // For a quick fix that doesn't wipe active inputs, we can just let
                        // the user see the new data whenever they change sections, OR we safely re-render.
                        // Because `renderSection` is destructive, we will trigger a safe table re-render if it exists.
                        const tbody = document.getElementById('daily-logs-tbody');
                        if (tbody && window.globalState.currentSection === 'daily-registration') {
                            window.renderSection('daily-registration');
                        } else {
                            window.renderSection(window.globalState.currentSection);
                        }
                    } else {
                        window.renderSection(window.globalState.currentSection);
                    }
                }
            } else {
                console.log("No cloud data found. Starting fresh.");
                window.isFirebaseStateLoaded = true;
                if (isInitialLoad) {
                    window.renderSection('dashboard');
                    isInitialLoad = false;
                }
            }
        }, (error) => {
            console.error("Firebase Sync Error:", error);
        });

        // 2. Also listen for User Management changes
        db.collection('users').onSnapshot((snapshot) => {
            const upToDateUsers = [];
            snapshot.forEach(doc => {
                const ud = doc.data();
                if (ud.role !== 'disabled') {
                    upToDateUsers.push(ud);
                }
            });
            window.globalState.users = upToDateUsers;

            // If we are currently looking at the users page, trigger a re-render
            if (window.globalState.currentSection === 'users') {
                window.renderSection('users');
            }
        });

        // 3. Listen for History Collection (New scalable way)
        db.collection('history').orderBy('closedAt', 'asc').onSnapshot((snapshot) => {
            console.log("[HISTORY SNAPSHOT] Syncing history from dedicated collection");
            const upToDateHistory = [];
            snapshot.forEach(doc => {
                upToDateHistory.push(doc.data());
            });
            window.globalState.payrollHistory = upToDateHistory;

            // If we are in specific sections that depend on history, re-render
            if (window.globalState.currentSection === 'closing' || window.globalState.currentSection === 'dashboard') {
                window.renderSection(window.globalState.currentSection);
            }
        });
    };

    window.savePayrollToHistory = async (snapshot) => {
        try {
            // Generate a unique ID based on timestamp if it doesn't have one
            const historyId = snapshot.id ? snapshot.id.toString() : Date.now().toString();
            console.log(`[FIREBASE] Saving payroll run ${historyId} to history collection`);
            await db.collection('history').doc(historyId).set(snapshot);
            return true;
        } catch (e) {
            console.error("Error saving to history collection:", e);
            return false;
        }
    };

    // TEMPORARY: Function to clear all history
    window.clearPayrollHistory = async () => {
        try {
            const snapshot = await db.collection('history').get();
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log("[CLEANUP] History collection cleared.");
            alert("El historial ha sido borrado exitosamente.");
            window.location.reload();
        } catch (e) {
            console.error("Error clearing history:", e);
        }
    };

    window.saveStateToFirebase = async () => {
        console.log(`[FIREBASE SAVE TRIGGERED]. isFirebaseStateLoaded: ${window.isFirebaseStateLoaded}, isInitialLoad: ${isInitialLoad}`);

        // Failsafe: Si Firebase no ha cargado los datos iniciales, NUNCA permitir guardar
        // porque sobrescribirá la base de datos de producción con el estado local vacío.
        if (!window.isFirebaseStateLoaded) {
            console.warn("[FIREBASE SAVE BLOCKED] Ignorando guardado: El estado de Firebase aún no ha cargado completamente para este usuario.");
            return;
        }

        console.log("[FIREBASE SAVE EXECUTING] Saving data to Firebase...");
        try {
            const stateToSave = { ...window.globalState };
            delete stateToSave.currentSection; // Do not sync UI state
            delete stateToSave.currentUser;    // Do not sync current session
            delete stateToSave.users;          // Users are managed in their own collection
            delete stateToSave.payrollHistory; // History is managed in history collection

            // --- DELTA CALCULATION ---
            // Instead of sending the entire state and overwriting what other users
            // might be doing in other modules, we ONLY send the modules that changed locally.
            const updates = {};
            Object.keys(stateToSave).forEach(key => {
                const cloudVal = window._lastCloudState ? window._lastCloudState[key] : undefined;
                const localVal = stateToSave[key];
                // Compare local modification against what we last pulled/pushed from the cloud
                if (JSON.stringify(cloudVal) !== JSON.stringify(localVal)) {
                    updates[key] = localVal;
                }
            });

            if (Object.keys(updates).length > 0) {
                console.log("[FIREBASE SAVE] Updates detected for modules:", Object.keys(updates));
                // We use merge: true so Firebase ONLY replaces these specific top-level keys
                await db.collection('payroll').doc('globalState').set(updates, { merge: true });

                // Update our baseline so we don't resave unless changed again
                if (!window._lastCloudState) window._lastCloudState = {};
                Object.keys(updates).forEach(k => {
                    window._lastCloudState[k] = JSON.parse(JSON.stringify(updates[k]));
                });
            } else {
                console.log("[FIREBASE SAVE] No module changes detected. Skipping write.");
            }
        } catch (e) {
            console.error("Error writing to Firebase:", e);
            // alert("Error de conexión al guardar en la nube.");
        }
    };

    // Data Migration Utility
    window.migrateLocalToFirebase = async () => {
        if (!confirm("¿Seguro que deseas subir tu base de datos local a la nube? Esto sobreescribirá lo que esté en Firebase.")) return;

        // Re-read from local storage exactly as the app used to do
        const localState = {
            departments: JSON.parse(localStorage.getItem('payroll_departments') || '[]'),
            operations: JSON.parse(localStorage.getItem('payroll_operations') || '[]'),
            activities: JSON.parse(localStorage.getItem('payroll_activities') || '[]'),
            employees: JSON.parse(localStorage.getItem('payroll_employees') || '[]'),
            periods: JSON.parse(localStorage.getItem('payroll_periods') || '[]'),
            activePayrolls: JSON.parse(localStorage.getItem('payroll_active') || '[]'),
            discounts: JSON.parse(localStorage.getItem('payroll_discounts') || '[]'),
            incentives: JSON.parse(localStorage.getItem('payroll_incentives') || '[]'),
            overtime: JSON.parse(localStorage.getItem('payroll_overtime') || '[]'),
            christmasSalary: JSON.parse(localStorage.getItem('payroll_christmas') || '[]'),
            payrollHistory: JSON.parse(localStorage.getItem('payroll_history') || '[]'),
            vacations: JSON.parse(localStorage.getItem('payroll_vacations') || '[]'),
            settings: JSON.parse(localStorage.getItem('payroll_settings') || '{}')
        };

        try {
            await db.collection('payroll').doc('globalState').set(localState);
            alert("¡Migración Completada! Ahora el sistema lee de Firebase.");
        } catch (e) {
            alert("Error al migrar: " + e.message);
        }
    };

    // Database Wipe Utility (Danger)
    window.wipeProductionDatabase = async () => {
        const confirm1 = confirm("⚠️ ADVERTENCIA ⚠️\n\n¿Estás completamente seguro de que quieres BORRAR TODOS los datos del sistema? (Empleados, departamentos, historial de nómina, etc.)\n\nEsta acción NO se puede deshacer.");
        if (!confirm1) return;

        const confirm2 = prompt("Para confirmar, escribe borrar datos");
        if (confirm2 !== "borrar datos") {
            alert("Proceso cancelado. La confirmación no coincidió.");
            return;
        }

        console.log("Iniciando formateo de base de datos...");
        try {
            // Eliminar solo la configuración y datos
            window.globalState.departments = [];
            window.globalState.operations = [];
            window.globalState.activities = [];
            window.globalState.employees = [];
            window.globalState.periods = [];
            window.globalState.activePayrolls = [];
            window.globalState.discounts = [];
            window.globalState.incentives = [];
            window.globalState.overtime = [];
            window.globalState.christmasSalary = [];
            window.globalState.payrollHistory = [];
            window.globalState.vacations = [];

            // Mantener solo los usuarios para no perder acceso
            const stateToSave = { ...window.globalState };
            delete stateToSave.currentSection;
            delete stateToSave.currentUser;

            await db.collection('payroll').doc('globalState').set(stateToSave);

            // Wipe Local Storage as well just in case
            localStorage.removeItem('payroll_departments');
            localStorage.removeItem('payroll_operations');
            localStorage.removeItem('payroll_activities');
            localStorage.removeItem('payroll_employees');
            localStorage.removeItem('payroll_periods');
            localStorage.removeItem('payroll_active');
            localStorage.removeItem('payroll_discounts');
            localStorage.removeItem('payroll_incentives');
            localStorage.removeItem('payroll_overtime');
            localStorage.removeItem('payroll_christmas');
            localStorage.removeItem('payroll_history');
            localStorage.removeItem('payroll_vacations');

            alert("✅ Sistema formateado con éxito. Ahora tienes una instalación limpia.");
            window.location.reload();
        } catch (e) {
            alert("Error al limpiar: " + e.message);
        }
    };

} else {
    console.error("Firebase SDKs not loaded.");
}
