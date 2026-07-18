(function () {
    "use strict";

    const config = window.MP_CONFIG || {};
    const data = window.MP_DATA;

    if (!data) {
        document.body.textContent = "تعذر تحميل بيانات المخالفات";
        return;
    }

    const state = {
        mode: "standard",
        tier: "all",
        selectedKey: "",
        reportNumber: createReportNumber(),
        requestId: createRequestId(),
        draftSaved: false,
        draftSubmissionAttempted: false,
        recordsScope: "active",
        records: [],
        counts: { active: 0, archive: 0 },
        recordsTruncated: false,
        recordsRequestSequence: 0,
        sessionToken: "",
        serverNowMs: Date.now(),
        recordsUnlocked: false,
        refreshTimer: null,
        lastFocusedElement: null
    };

    const elements = {
        caseForm: byId("caseForm"),
        appShell: document.querySelector(".app-shell"),
        investigatorName: byId("investigatorName"),
        accusedName: byId("accusedName"),
        rankSelect: byId("rankSelect"),
        repeatOffense: byId("repeatOffense"),
        violationSearch: byId("violationSearch"),
        violationList: byId("violationList"),
        violationCount: byId("violationCount"),
        standardFilters: byId("standardFilters"),
        tierFilters: byId("tierFilters"),
        modeButtons: Array.from(document.querySelectorAll("[data-mode]")),
        viewTabs: Array.from(document.querySelectorAll("[data-view]")),
        calculatorView: byId("calculatorView"),
        recordsView: byId("recordsView"),
        summaryAccused: byId("summaryAccused"),
        summaryInvestigator: byId("summaryInvestigator"),
        summaryViolation: byId("summaryViolation"),
        summaryClassification: byId("summaryClassification"),
        summaryRank: byId("summaryRank"),
        summaryPenalty: byId("summaryPenalty"),
        reportPreview: byId("reportPreview"),
        copyReportButton: byId("copyReportButton"),
        openCourtModalButton: byId("openCourtModalButton"),
        resetCaseButton: byId("resetCaseButton"),
        cloudStatus: byId("cloudStatus"),
        cloudStatusText: byId("cloudStatusText"),
        toastRegion: byId("toastRegion"),
        courtModal: byId("courtModal"),
        closeCourtModalButton: byId("closeCourtModalButton"),
        cancelCourtButton: byId("cancelCourtButton"),
        courtConfirmForm: byId("courtConfirmForm"),
        courtMemberName: byId("courtMemberName"),
        courtMemberError: byId("courtMemberError"),
        investigationFileNumber: byId("investigationFileNumber"),
        investigationFileError: byId("investigationFileError"),
        warningDurationDays: byId("warningDurationDays"),
        warningDurationError: byId("warningDurationError"),
        courtSecurityToken: byId("courtSecurityToken"),
        courtTokenError: byId("courtTokenError"),
        courtCaseSummary: byId("courtCaseSummary"),
        confirmCourtButton: byId("confirmCourtButton"),
        recordsGate: byId("recordsGate"),
        recordsUnlockForm: byId("recordsUnlockForm"),
        recordsToken: byId("recordsToken"),
        unlockRecordsButton: byId("unlockRecordsButton"),
        recordsContent: byId("recordsContent"),
        activeCount: byId("activeCount"),
        expiringCount: byId("expiringCount"),
        archiveCount: byId("archiveCount"),
        recordsSearch: byId("recordsSearch"),
        recordScopeButtons: Array.from(document.querySelectorAll("[data-scope]")),
        recordsTableBody: byId("recordsTableBody"),
        recordsCards: byId("recordsCards"),
        recordsFeedback: byId("recordsFeedback"),
        refreshRecordsButton: byId("refreshRecordsButton"),
        lastSyncText: byId("lastSyncText"),
        appVersion: byId("appVersion")
    };

    init();

    function init() {
        elements.appVersion.textContent = `الإصدار ${config.appVersion || "3.0.0"}`;
        elements.warningDurationDays.value = String(config.defaultDurationDays || 7);

        bindEvents();
        renderViolations();
        renderSummary();
        setConnectionState("idle", "جاهز للاستخدام");

        state.refreshTimer = window.setInterval(function () {
            if (state.recordsUnlocked && !document.hidden) {
                loadRecords({ quiet: true }).catch(function () {
                    return undefined;
                });
            }
        }, Number(config.refreshIntervalMs) || 60000);
    }

    function bindEvents() {
        [elements.investigatorName, elements.accusedName, elements.rankSelect].forEach(function (control) {
            control.addEventListener("input", handleDraftChange);
            control.addEventListener("change", handleDraftChange);
        });

        elements.repeatOffense.addEventListener("change", handleDraftChange);
        elements.violationSearch.addEventListener("input", debounce(renderViolations, 120));

        elements.modeButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                switchMode(button.dataset.mode);
            });
        });

        elements.tierFilters.addEventListener("click", function (event) {
            const button = event.target.closest("[data-tier]");
            if (!button) {
                return;
            }
            state.tier = button.dataset.tier;
            Array.from(elements.tierFilters.querySelectorAll("[data-tier]")).forEach(function (item) {
                const active = item === button;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", String(active));
            });
            renderViolations();
        });

        elements.violationList.addEventListener("click", function (event) {
            const button = event.target.closest("[data-violation-key]");
            if (!button) {
                return;
            }
            state.selectedKey = button.dataset.violationKey;
            markDraftDirty();
            renderViolations();
            renderSummary();
        });

        elements.viewTabs.forEach(function (button) {
            button.addEventListener("click", function () {
                switchView(button.dataset.view);
            });
            button.addEventListener("keydown", handleWorkflowTabKeydown);
        });

        elements.copyReportButton.addEventListener("click", copyCurrentReport);
        elements.openCourtModalButton.addEventListener("click", openCourtModal);
        elements.resetCaseButton.addEventListener("click", resetCase);
        elements.closeCourtModalButton.addEventListener("click", closeCourtModal);
        elements.cancelCourtButton.addEventListener("click", closeCourtModal);
        elements.courtConfirmForm.addEventListener("submit", saveCourtRecord);

        elements.courtModal.addEventListener("click", function (event) {
            if (event.target === elements.courtModal) {
                closeCourtModal();
            }
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !elements.courtModal.hidden) {
                closeCourtModal();
                return;
            }
            if (event.key === "Tab" && !elements.courtModal.hidden) {
                trapModalFocus(event);
            }
        });

        elements.recordsUnlockForm.addEventListener("submit", unlockRecords);
        elements.refreshRecordsButton.addEventListener("click", function () {
            loadRecords({ quiet: false }).catch(function () {
                return undefined;
            });
        });
        elements.recordsSearch.addEventListener("input", debounce(renderRecords, 120));

        elements.recordScopeButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                const newScope = button.dataset.scope;
                if (newScope === state.recordsScope) {
                    return;
                }
                state.recordsScope = newScope;
                elements.recordScopeButtons.forEach(function (item) {
                    const active = item === button;
                    item.classList.toggle("is-active", active);
                    item.setAttribute("aria-pressed", String(active));
                });
                loadRecords({ quiet: false }).catch(function () {
                    return undefined;
                });
            });
        });

        elements.recordsTableBody.addEventListener("click", handleRecordAction);
        elements.recordsCards.addEventListener("click", handleRecordAction);
    }

    function switchMode(mode) {
        if (mode !== "standard" && mode !== "fixed") {
            return;
        }

        state.mode = mode;
        state.selectedKey = "";
        state.tier = "all";
        markDraftDirty();
        elements.violationSearch.value = "";
        elements.standardFilters.hidden = mode !== "standard";

        elements.modeButtons.forEach(function (button) {
            const active = button.dataset.mode === mode;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        Array.from(elements.tierFilters.querySelectorAll("[data-tier]")).forEach(function (button) {
            const active = button.dataset.tier === "all";
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
        });

        renderViolations();
        renderSummary();
    }

    function switchView(view) {
        const showRecords = view === "records";
        elements.calculatorView.hidden = showRecords;
        elements.recordsView.hidden = !showRecords;

        elements.viewTabs.forEach(function (button) {
            const active = button.dataset.view === view;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        });

        if (showRecords) {
            if (state.recordsUnlocked) {
                loadRecords({ quiet: true }).catch(function () {
                    return undefined;
                });
                elements.recordsSearch.focus();
            } else {
                elements.recordsToken.focus();
            }
        } else {
            elements.investigatorName.focus();
        }
    }

    function handleWorkflowTabKeydown(event) {
        const supportedKeys = ["ArrowLeft", "ArrowRight", "Home", "End"];
        if (!supportedKeys.includes(event.key)) {
            return;
        }

        event.preventDefault();
        const currentIndex = elements.viewTabs.indexOf(event.currentTarget);
        let nextIndex = currentIndex;

        if (event.key === "Home") {
            nextIndex = 0;
        } else if (event.key === "End") {
            nextIndex = elements.viewTabs.length - 1;
        } else if (event.key === "ArrowLeft") {
            nextIndex = (currentIndex + 1) % elements.viewTabs.length;
        } else if (event.key === "ArrowRight") {
            nextIndex = (currentIndex - 1 + elements.viewTabs.length) % elements.viewTabs.length;
        }

        const nextTab = elements.viewTabs[nextIndex];
        nextTab.focus();
        switchView(nextTab.dataset.view);
    }

    function handleDraftChange() {
        markDraftDirty();
        renderSummary();
    }

    function markDraftDirty() {
        if (state.draftSaved || state.draftSubmissionAttempted) {
            state.requestId = createRequestId();
            state.draftSaved = false;
            state.draftSubmissionAttempted = false;
        }
    }

    function getCurrentItems() {
        const source = state.mode === "standard" ? data.standardViolations : data.fixedViolations;
        const query = normalizeArabic(elements.violationSearch.value);

        return source.filter(function (item) {
            if (state.mode === "standard" && state.tier !== "all" && item.tier !== state.tier) {
                return false;
            }

            if (!query) {
                return true;
            }

            return normalizeArabic(`${item.id || ""} ${item.text || ""} ${item.tierName || ""}`).includes(query);
        });
    }

    function renderViolations() {
        const items = getCurrentItems();
        const fragment = document.createDocumentFragment();
        elements.violationList.replaceChildren();
        elements.violationCount.textContent = `${items.length} نتيجة`;

        if (!items.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.textContent = "لا توجد مخالفة مطابقة لبحثك";
            elements.violationList.appendChild(empty);
            return;
        }

        items.forEach(function (item) {
            const button = document.createElement("button");
            const text = document.createElement("span");
            const meta = document.createElement("span");
            const isSelected = item.key === state.selectedKey;

            button.type = "button";
            button.className = `violation-button${isSelected ? " is-selected" : ""}`;
            button.dataset.violationKey = item.key;
            button.setAttribute("aria-pressed", String(isSelected));

            text.className = "violation-text";
            text.textContent = item.text;
            meta.className = "violation-meta";
            meta.textContent = state.mode === "standard"
                ? `بند ${item.id}  ${item.tierName}`
                : "مخالفة ثابتة";

            button.append(text, meta);
            fragment.appendChild(button);
        });

        elements.violationList.appendChild(fragment);
    }

    function renderSummary() {
        const item = getSelectedItem();
        const investigator = cleanText(elements.investigatorName.value);
        const accused = cleanText(elements.accusedName.value);
        const rank = elements.rankSelect.value;
        const penalty = item ? calculatePenalty(item) : "";

        elements.summaryInvestigator.textContent = investigator || "لم يحدد بعد";
        elements.summaryAccused.textContent = accused || "لم يحدد بعد";
        elements.summaryRank.textContent = rank;
        elements.summaryViolation.textContent = item ? item.text : "اختر مخالفة من القائمة";
        elements.summaryClassification.textContent = item ? getClassification(item) : "لم يحدد بعد";
        elements.summaryPenalty.textContent = penalty || "اختر مخالفة لعرض العقوبة";

        const report = buildReport({
            reportNumber: state.reportNumber,
            investigator: investigator,
            accused: accused,
            violationText: item ? item.text : "",
            classification: item ? getClassification(item) : "",
            penalty: penalty
        });

        elements.reportPreview.textContent = report || "أكمل بيانات القضية واختر المخالفة لعرض التقرير";
    }

    function getSelectedItem() {
        if (!state.selectedKey) {
            return null;
        }
        const source = state.mode === "standard" ? data.standardViolations : data.fixedViolations;
        return source.find(function (item) {
            return item.key === state.selectedKey;
        }) || null;
    }

    function calculatePenalty(item) {
        const selectedOption = elements.rankSelect.options[elements.rankSelect.selectedIndex];
        const matrixKey = selectedOption.dataset.matrixKey;
        let penalty = "";

        if (state.mode === "standard") {
            const rankPenalties = data.penaltyMatrix[matrixKey] || {};
            penalty = rankPenalties[item.tier] || "تقديري ويُرفع للقيادة";
            if (item.tier === "t5" || item.tier === "t6") {
                penalty += " + كسر رتبة";
            }
        } else if (typeof item.calc === "function") {
            penalty = item.calc(matrixKey);
        } else {
            penalty = item.penalty || "تقديري ويُرفع للقيادة";
        }

        if (elements.repeatOffense.checked) {
            penalty = `⚠️ [عقوبة مضاعفة للتكرار]: ${penalty} [تُدبل العقوبة والغرابة ×2]`;
        }

        return penalty;
    }

    function getClassification(item) {
        return state.mode === "standard"
            ? `بند (${item.id}) - ${item.tierName}`
            : "قوانين مخالفات ثابتة";
    }

    function buildReport(record) {
        if (
            !record ||
            !record.investigator ||
            !record.accused ||
            !record.violationText ||
            !record.classification ||
            !record.penalty
        ) {
            return "";
        }

        return `تم فتح ملف تحقيق رقم : ${record.reportNumber}\n\n` +
            `\`هيئه التحقيق العسكري   :   \`  ${record.investigator}\n\n` +
            `\` على العسكري :\`       ${record.accused}\n\n` +
            `\`التهمة :  \`   ${record.violationText} / ${record.classification}\n\n` +
            `\`تم سماع أقواله :  \`   لم يحضر الاستدعاء\n\n` +
            `\`أتضح لنا أنه :   مذنب / غير مذنب  \`  \n` +
            `يُرسل ملفنا هذا إلى ${config.discordRoleMention || "<@&1305901086158225490>"}  لإصدار الحكم بحق المذكور أعلاه\n\n` +
            `\`الحكم المقترح:  \` ${record.penalty}`;
    }

    function validateDraft() {
        clearDraftErrors();
        const investigator = cleanText(elements.investigatorName.value);
        const accused = cleanText(elements.accusedName.value);
        const item = getSelectedItem();
        let firstInvalid = null;

        if (!investigator) {
            setFieldError("investigatorName", "investigatorError", "اكتب اسم المحقق");
            firstInvalid = firstInvalid || elements.investigatorName;
        }
        if (!accused) {
            setFieldError("accusedName", "accusedError", "اكتب اسم المتهم العسكري");
            firstInvalid = firstInvalid || elements.accusedName;
        }
        if (!item) {
            showToast("اختر المخالفة من القائمة أولًا", "error");
            firstInvalid = firstInvalid || elements.violationSearch;
        }

        if (firstInvalid) {
            firstInvalid.focus();
            return null;
        }

        return {
            item: item,
            investigator: investigator,
            accused: accused,
            rank: elements.rankSelect.value,
            matrixKey: elements.rankSelect.options[elements.rankSelect.selectedIndex].dataset.matrixKey,
            classification: getClassification(item),
            penalty: calculatePenalty(item),
            repeated: elements.repeatOffense.checked,
            reportNumber: state.reportNumber
        };
    }

    async function copyCurrentReport() {
        const draft = validateDraft();
        if (!draft) {
            return;
        }

        const report = buildReport({
            reportNumber: draft.reportNumber,
            investigator: draft.investigator,
            accused: draft.accused,
            violationText: draft.item.text,
            classification: draft.classification,
            penalty: draft.penalty
        });

        try {
            await copyText(report);
            showToast("تم نسخ تقرير التحقيق بنفس التنسيق المعتمد", "success");
        } catch (error) {
            showToast("تعذر النسخ التلقائي افتح المعاينة وانسخ التقرير يدويًا", "error");
        }
    }

    function openCourtModal() {
        if (state.draftSaved) {
            showToast("تم تثبيت هذه المسودة بالفعل ابدأ قضية جديدة أو عدل بياناتها", "info");
            return;
        }

        const draft = validateDraft();
        if (!draft) {
            return;
        }

        elements.investigationFileNumber.value = draft.reportNumber;
        elements.courtSecurityToken.value = state.sessionToken;
        elements.courtCaseSummary.replaceChildren(
            summaryLine("المتهم", draft.accused),
            summaryLine("المخالفة", draft.item.text),
            summaryLine("العقوبة المقترحة", draft.penalty)
        );

        state.lastFocusedElement = document.activeElement;
        elements.courtModal.hidden = false;
        elements.appShell.inert = true;
        document.body.classList.add("modal-open");
        clearCourtErrors();
        window.requestAnimationFrame(function () {
            elements.courtMemberName.focus();
        });
    }

    function closeCourtModal() {
        elements.courtModal.hidden = true;
        elements.appShell.inert = false;
        document.body.classList.remove("modal-open");
        if (state.lastFocusedElement && typeof state.lastFocusedElement.focus === "function") {
            state.lastFocusedElement.focus();
        }
    }

    async function saveCourtRecord(event) {
        event.preventDefault();
        clearCourtErrors();
        const draft = validateDraft();
        if (!draft) {
            closeCourtModal();
            return;
        }

        const courtMember = cleanText(elements.courtMemberName.value);
        const reportNumber = cleanText(elements.investigationFileNumber.value);
        const token = elements.courtSecurityToken.value.trim();
        const durationDays = Number(elements.warningDurationDays.value);
        let firstInvalid = null;

        if (!courtMember) {
            setCourtFieldError(elements.courtMemberName, elements.courtMemberError, "اكتب اسم عضو مجلس القضاء");
            firstInvalid = firstInvalid || elements.courtMemberName;
        }
        if (!reportNumber) {
            setCourtFieldError(elements.investigationFileNumber, elements.investigationFileError, "اكتب رقم ملف التحقيق");
            firstInvalid = firstInvalid || elements.investigationFileNumber;
        }
        if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) {
            setCourtFieldError(elements.warningDurationDays, elements.warningDurationError, "المدة يجب أن تكون بين يوم و365 يومًا");
            firstInvalid = firstInvalid || elements.warningDurationDays;
        }
        if (token.length < 16) {
            setCourtFieldError(elements.courtSecurityToken, elements.courtTokenError, "رمز مجلس القضاء لا يقل عن 16 خانة");
            firstInvalid = firstInvalid || elements.courtSecurityToken;
        }
        if (firstInvalid) {
            showToast("راجع حقول تثبيت الإنذار", "error");
            firstInvalid.focus();
            return;
        }

        const payload = {
            action: "insert",
            token: token,
            requestId: state.requestId,
            reportNumber: reportNumber,
            investigator: draft.investigator,
            courtMember: courtMember,
            accused: draft.accused,
            rank: draft.rank,
            rankKey: draft.matrixKey,
            violationKey: draft.item.key,
            violationId: draft.item.id,
            violationText: draft.item.text,
            violationType: state.mode,
            tier: draft.item.tier || "",
            classification: draft.classification,
            proposedPenalty: draft.penalty,
            repeated: draft.repeated,
            durationDays: durationDays
        };

        setButtonBusy(elements.confirmCourtButton, true, "جاري التثبيت");
        setConnectionState("loading", "جاري تثبيت الإنذار");
        state.draftSubmissionAttempted = true;

        try {
            const response = await callApi(payload);
            if (response.status !== "success") {
                throw new Error(response.error || "تعذر تثبيت الإنذار");
            }

            state.sessionToken = token;
            state.draftSaved = true;
            elements.recordsToken.value = token;
            closeCourtModal();
            setConnectionState("online", "تمت المزامنة");
            showToast(`تم تثبيت الإنذار وحفظ القضية ${response.caseId || reportNumber}`, "success");
        } catch (error) {
            setConnectionState("error", "تعذر الاتصال بالسجل");
            showToast(readableError(error), "error");
        } finally {
            setButtonBusy(elements.confirmCourtButton, false);
        }
    }

    async function unlockRecords(event) {
        event.preventDefault();
        const token = elements.recordsToken.value.trim();
        if (token.length < 16) {
            showToast("رمز مجلس القضاء لا يقل عن 16 خانة", "error");
            elements.recordsToken.focus();
            return;
        }

        state.sessionToken = token;
        setButtonBusy(elements.unlockRecordsButton, true, "جاري التحقق");

        try {
            await loadRecords({ quiet: false, token: token });
            state.recordsUnlocked = true;
            elements.recordsGate.hidden = true;
            elements.recordsContent.hidden = false;
            elements.recordsSearch.focus();
        } catch (error) {
            state.sessionToken = "";
            showToast(readableError(error), "error");
            elements.recordsToken.select();
        } finally {
            setButtonBusy(elements.unlockRecordsButton, false);
        }
    }

    async function loadRecords(options) {
        const settings = options || {};
        const token = settings.token || state.sessionToken;
        const requestedScope = state.recordsScope;
        const requestSequence = ++state.recordsRequestSequence;
        if (!token) {
            throw new Error("رمز مجلس القضاء مطلوب");
        }

        if (!settings.quiet) {
            elements.recordsFeedback.textContent = "جاري مزامنة السجل";
            setConnectionState("loading", "جاري المزامنة");
            setButtonBusy(elements.refreshRecordsButton, true, "جاري التحديث");
        }

        try {
            const response = await callApi({
                action: "list",
                token: token,
                scope: requestedScope
            });

            if (response.status !== "success") {
                throw new Error(response.error || "تعذر قراءة السجل");
            }

            if (
                requestSequence !== state.recordsRequestSequence ||
                requestedScope !== state.recordsScope
            ) {
                return { stale: true };
            }

            state.serverNowMs = Number(response.serverNowMs) || Date.now();
            state.records = Array.isArray(response.records) ? response.records : [];
            state.counts = response.counts || state.counts;
            state.recordsTruncated = response.truncated === true;
            state.recordsUnlocked = true;

            elements.recordsGate.hidden = true;
            elements.recordsContent.hidden = false;
            elements.recordsFeedback.textContent = state.recordsTruncated
                ? "يعرض النظام أحدث ألف سجل من الأرشيف"
                : "";
            elements.lastSyncText.textContent = `آخر مزامنة ${formatDateTime(state.serverNowMs)}`;
            setConnectionState("online", "السجل متصل");
            renderRecords();
        } catch (error) {
            if (requestSequence !== state.recordsRequestSequence) {
                return { stale: true };
            }
            setConnectionState("error", "تعذر مزامنة السجل");
            elements.recordsFeedback.textContent = readableError(error);
            if (isAuthorizationError(error)) {
                lockRecordsView();
            }
            throw error;
        } finally {
            if (!settings.quiet) {
                setButtonBusy(elements.refreshRecordsButton, false);
            }
        }
    }

    function renderRecords() {
        const query = normalizeArabic(elements.recordsSearch.value);
        const now = state.serverNowMs || Date.now();
        const filtered = state.records.filter(function (record) {
            const expiry = getTimeValue(record.expiresAtMs || record.expiresAt);
            if (state.recordsScope === "active" && expiry > 0 && expiry <= now) {
                return false;
            }

            if (!query) {
                return true;
            }

            const haystack = [
                record.reportNumber,
                record.caseId,
                record.accused,
                record.rank,
                record.violationId,
                record.violationText,
                record.classification,
                record.investigator,
                record.courtMember
            ].join(" ");

            return normalizeArabic(haystack).includes(query);
        });

        const expiring = state.records.filter(function (record) {
            const remaining = getTimeValue(record.expiresAtMs || record.expiresAt) - now;
            return remaining > 0 && remaining <= 3 * 24 * 60 * 60 * 1000;
        }).length;

        elements.activeCount.textContent = String(Number(state.counts.active) || (state.recordsScope === "active" ? state.records.length : 0));
        elements.archiveCount.textContent = String(Number(state.counts.archive) || (state.recordsScope === "archive" ? state.records.length : 0));
        elements.expiringCount.textContent = String(state.recordsScope === "active" ? expiring : 0);

        elements.recordsTableBody.replaceChildren();
        elements.recordsCards.replaceChildren();

        if (!filtered.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 10;
            cell.className = "empty-state";
            cell.textContent = query ? "لا توجد نتائج مطابقة للبحث" : getEmptyRecordsMessage();
            row.appendChild(cell);
            elements.recordsTableBody.appendChild(row);

            const emptyCard = document.createElement("div");
            emptyCard.className = "empty-state";
            emptyCard.textContent = cell.textContent;
            elements.recordsCards.appendChild(emptyCard);
            return;
        }

        const tableFragment = document.createDocumentFragment();
        const cardFragment = document.createDocumentFragment();

        filtered.forEach(function (record) {
            tableFragment.appendChild(buildRecordRow(record));
            cardFragment.appendChild(buildRecordCard(record));
        });

        elements.recordsTableBody.appendChild(tableFragment);
        elements.recordsCards.appendChild(cardFragment);
    }

    function buildRecordRow(record) {
        const row = document.createElement("tr");
        const cells = [
            record.reportNumber || record.caseId || "غير محدد",
            record.accused || "غير محدد",
            record.rank || "غير محدد",
            record.classification || record.violationId || "غير محدد",
            record.proposedPenalty || record.penalty || "غير محدد",
            record.investigator || "غير محدد",
            formatDateTime(record.createdAtMs || record.createdAt),
            formatDateTime(record.expiresAtMs || record.expiresAt)
        ];

        cells.forEach(function (value, index) {
            const cell = document.createElement("td");
            cell.textContent = value;
            if (index === 4) {
                cell.className = "penalty-cell";
            }
            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        statusCell.appendChild(buildStatusBadge(record));
        row.appendChild(statusCell);

        const actionCell = document.createElement("td");
        actionCell.appendChild(buildCopyRecordButton(record));
        row.appendChild(actionCell);
        return row;
    }

    function buildRecordCard(record) {
        const card = document.createElement("article");
        const head = document.createElement("div");
        const title = document.createElement("div");
        const name = document.createElement("strong");
        const number = document.createElement("span");
        const details = document.createElement("dl");
        const action = buildCopyRecordButton(record);

        card.className = "record-card";
        head.className = "record-card-head";
        title.className = "record-card-title";
        name.textContent = record.accused || "غير محدد";
        number.textContent = `ملف ${record.reportNumber || record.caseId || "غير محدد"}`;
        title.append(name, number);
        head.append(title, buildStatusBadge(record));
        card.appendChild(head);

        [
            ["الرتبة", record.rank],
            ["المخالفة", record.violationText || record.classification],
            ["العقوبة", record.proposedPenalty || record.penalty],
            ["المحقق", record.investigator],
            ["التثبيت", formatDateTime(record.createdAtMs || record.createdAt)],
            ["الانتهاء", formatDateTime(record.expiresAtMs || record.expiresAt)]
        ].forEach(function (pair) {
            const wrapper = document.createElement("div");
            const term = document.createElement("dt");
            const description = document.createElement("dd");
            term.textContent = pair[0];
            description.textContent = pair[1] || "غير محدد";
            wrapper.append(term, description);
            details.appendChild(wrapper);
        });

        action.classList.add("record-card-action");
        card.append(details, action);
        return card;
    }

    function buildStatusBadge(record) {
        const badge = document.createElement("span");
        const expiry = getTimeValue(record.expiresAtMs || record.expiresAt);
        const active = state.recordsScope === "active" &&
            expiry > (state.serverNowMs || Date.now());

        if (state.recordsScope === "active" && !expiry) {
            badge.className = "status-badge status-error";
            badge.textContent = "يحتاج مراجعة";
        } else {
            badge.className = `status-badge ${active ? "status-active" : "status-archived"}`;
            badge.textContent = active ? getRemainingLabel(record) : "مؤرشف";
        }
        return badge;
    }

    function buildCopyRecordButton(record) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "table-action";
        button.dataset.recordId = String(record.caseId || record.reportNumber || "");
        button.textContent = "نسخ التقرير";
        return button;
    }

    async function handleRecordAction(event) {
        const button = event.target.closest("[data-record-id]");
        if (!button) {
            return;
        }

        const id = button.dataset.recordId;
        const record = state.records.find(function (item) {
            return String(item.caseId || item.reportNumber || "") === id;
        });

        if (!record) {
            showToast("تعذر العثور على بيانات القضية", "error");
            return;
        }

        const report = buildReport({
            reportNumber: record.reportNumber || record.caseId,
            investigator: record.investigator,
            accused: record.accused,
            violationText: record.violationText,
            classification: record.classification,
            penalty: record.proposedPenalty || record.penalty
        });

        if (!report) {
            showToast("هذه القضية القديمة لا تحتوي على كامل بيانات التقرير", "error");
            return;
        }

        try {
            await copyText(report);
            showToast("تم نسخ تقرير القضية", "success");
        } catch (error) {
            showToast("تعذر نسخ التقرير", "error");
        }
    }

    function resetCase() {
        elements.caseForm.reset();
        elements.repeatOffense.checked = false;
        elements.violationSearch.value = "";
        state.mode = "standard";
        state.tier = "all";
        state.selectedKey = "";
        state.reportNumber = createReportNumber();
        state.requestId = createRequestId();
        state.draftSaved = false;
        state.draftSubmissionAttempted = false;
        switchMode("standard");
        clearDraftErrors();
        renderSummary();
        elements.investigatorName.focus();
        showToast("تم فتح مسودة قضية جديدة", "info");
    }

    async function callApi(payload) {
        if (!config.scriptUrl || !/^https:\/\/script\.google\.com\//.test(config.scriptUrl)) {
            throw new Error("لم يتم إعداد رابط Google Apps Script بعد");
        }

        const response = await fetch(config.scriptUrl, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=utf-8"
            },
            body: JSON.stringify(payload),
            redirect: "follow",
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`تعذر الاتصال بالخادم برمز ${response.status}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (error) {
            throw new Error("استجابة الخادم غير صحيحة حدث نشر Google Apps Script ثم حاول مجددًا");
        }
    }

    async function copyText(text) {
        if (navigator.clipboard && window.isSecureContext) {
            try {
                await Promise.race([
                    navigator.clipboard.writeText(text),
                    new Promise(function (_, reject) {
                        window.setTimeout(function () {
                            reject(new Error("clipboard_timeout"));
                        }, 1200);
                    })
                ]);
                return;
            } catch (error) {
                // بعض المتصفحات تمنع واجهة الحافظة رغم أن الضغط صدر من المستخدم
            }
        }

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.className = "clipboard-fallback";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied) {
            throw new Error("copy_failed");
        }
    }

    function setConnectionState(status, message) {
        elements.cloudStatus.dataset.state = status;
        elements.cloudStatusText.textContent = message;
    }

    function showToast(message, type) {
        const toast = document.createElement("div");
        toast.className = `toast toast-${type || "info"}`;
        toast.textContent = message;
        elements.toastRegion.appendChild(toast);

        window.setTimeout(function () {
            toast.classList.add("is-leaving");
            window.setTimeout(function () {
                toast.remove();
            }, 250);
        }, 4200);
    }

    function setButtonBusy(button, busy, label) {
        if (busy) {
            button.dataset.originalLabel = button.textContent;
            button.textContent = label || "جاري التنفيذ";
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
        } else {
            button.textContent = button.dataset.originalLabel || button.textContent;
            button.disabled = false;
            button.removeAttribute("aria-busy");
        }
    }

    function clearDraftErrors() {
        ["investigatorName", "accusedName"].forEach(function (id) {
            byId(id).removeAttribute("aria-invalid");
        });
        byId("investigatorError").textContent = "";
        byId("accusedError").textContent = "";
    }

    function setFieldError(fieldId, errorId, message) {
        byId(fieldId).setAttribute("aria-invalid", "true");
        byId(errorId).textContent = message;
    }

    function summaryLine(label, value) {
        const row = document.createElement("div");
        const term = document.createElement("span");
        const description = document.createElement("strong");
        term.textContent = label;
        description.textContent = value;
        row.append(term, description);
        return row;
    }

    function getRemainingLabel(record) {
        const expiry = getTimeValue(record.expiresAtMs || record.expiresAt);
        if (!expiry) {
            return "يحتاج مراجعة";
        }
        const remaining = expiry - (state.serverNowMs || Date.now());
        const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
        if (days <= 0) {
            return "ينتهي الآن";
        }
        if (days === 1) {
            return "متبقٍ يوم";
        }
        if (days === 2) {
            return "متبقي يومان";
        }
        return `متبقي ${days} أيام`;
    }

    function getEmptyRecordsMessage() {
        return state.recordsScope === "active"
            ? "لا توجد إنذارات نشطة حاليًا"
            : "لا توجد قضايا في الأرشيف حاليًا";
    }

    function formatDateTime(value) {
        const timestamp = getTimeValue(value);
        if (!timestamp) {
            return "غير محدد";
        }

        try {
            return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: config.timezone || "Asia/Riyadh"
            }).format(new Date(timestamp));
        } catch (error) {
            return new Date(timestamp).toLocaleString("ar-SA");
        }
    }

    function getTimeValue(value) {
        if (typeof value === "number") {
            return value;
        }
        if (!value) {
            return 0;
        }
        const numberValue = Number(value);
        if (Number.isFinite(numberValue) && numberValue > 0) {
            return numberValue;
        }
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function readableError(error) {
        const message = error && error.message ? error.message : "حدث خطأ غير متوقع";
        if (/token|رمز|unauthorized|forbidden/i.test(message)) {
            return "رمز مجلس القضاء غير صحيح أو انتهت صلاحيته";
        }
        if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
            return "تعذر الوصول إلى السجل السحابي تحقق من الاتصال ونشر Apps Script";
        }
        return message;
    }

    function isAuthorizationError(error) {
        const message = error && error.message ? error.message : "";
        return /رمز مجلس القضاء|unauthorized|forbidden|token/i.test(message);
    }

    function lockRecordsView() {
        state.recordsRequestSequence += 1;
        state.recordsUnlocked = false;
        state.sessionToken = "";
        state.records = [];
        state.counts = { active: 0, archive: 0 };
        elements.recordsToken.value = "";
        elements.courtSecurityToken.value = "";
        elements.recordsContent.hidden = true;
        elements.recordsGate.hidden = false;
    }

    function clearCourtErrors() {
        [
            [elements.courtMemberName, elements.courtMemberError],
            [elements.investigationFileNumber, elements.investigationFileError],
            [elements.warningDurationDays, elements.warningDurationError],
            [elements.courtSecurityToken, elements.courtTokenError]
        ].forEach(function (pair) {
            pair[0].removeAttribute("aria-invalid");
            pair[1].textContent = "";
        });
    }

    function setCourtFieldError(field, errorElement, message) {
        field.setAttribute("aria-invalid", "true");
        errorElement.textContent = message;
    }

    function trapModalFocus(event) {
        const focusable = Array.from(elements.courtModal.querySelectorAll(
            "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex='-1'])"
        )).filter(function (element) {
            return element.offsetParent !== null;
        });

        if (!focusable.length) {
            event.preventDefault();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function normalizeArabic(value) {
        return String(value || "")
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u064B-\u065F\u0670]/g, "")
            .replace(/[أإآ]/g, "ا")
            .replace(/ى/g, "ي")
            .replace(/ة/g, "ه")
            .replace(/\s+/g, " ")
            .trim();
    }

    function createReportNumber() {
        if (window.crypto && typeof window.crypto.getRandomValues === "function") {
            const values = new Uint32Array(1);
            window.crypto.getRandomValues(values);
            return String(1000 + (values[0] % 9000));
        }
        return String(Math.floor(1000 + Math.random() * 9000));
    }

    function createRequestId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }
        return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function debounce(fn, delay) {
        let timer;
        return function () {
            const args = arguments;
            window.clearTimeout(timer);
            timer = window.setTimeout(function () {
                fn.apply(null, args);
            }, delay);
        };
    }

    function byId(id) {
        return document.getElementById(id);
    }
})();
