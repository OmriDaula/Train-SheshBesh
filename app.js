/* app.js */
const MODEL_NAME = "gpt-4.1";
let memoryApiKey = "";

const REGIONS = {
    topLeft: [12, 13, 14, 15, 16, 17],
    topRight: [18, 19, 20, 21, 22, 23],
    bottomLeft: [11, 10, 9, 8, 7, 6],
    bottomRight: [5, 4, 3, 2, 1, 0]
};

const getInitialBoard = () => Array.from({ length: 24 }).map((_, i) => {
    if (i === 0) return { color: 'black', count: 2 };
    if (i === 5) return { color: 'white', count: 5 };
    if (i === 7) return { color: 'white', count: 3 };
    if (i === 11) return { color: 'black', count: 5 };
    if (i === 12) return { color: 'white', count: 5 };
    if (i === 16) return { color: 'black', count: 3 };
    if (i === 18) return { color: 'black', count: 5 };
    if (i === 23) return { color: 'white', count: 2 };
    return { color: null, count: 0 };
});

let currentState = {
    board: getInitialBoard(),
    bar: { white: 0, black: 0 },
    bearOff: { white: 0, black: 0 },
    rolledDice: [],
    unusedDice: [],
    isHumanTurn: true,
    isGameOver: false,
    winner: null,
    winType: null
};

let matchScore = { white: 0, black: 0 };
const MATCH_TARGET = 5;
let humanValidSequences = [];

const el = (id) => document.getElementById(id);

const addLog = (msg, isError = false, isRationale = false) => {
    const container = el('log-container');
    const entry = document.createElement('div');
    entry.className = `log-entry ${isError ? 'error-log' : ''} ${isRationale ? 'ai-rationale' : ''}`;
    entry.textContent = msg;
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
};

const calculatePipCount = (state, color) => {
    const isWhite = color === 'white';
    let pips = state.bar[color] * 25; // 25 pips standard per checker on bar

    state.board.forEach((pt, i) => {
        if (pt.color === color) {
            // White distance to 0, Black distance to 25
            const distance = isWhite ? i + 1 : 24 - i;
            pips += distance * pt.count;
        }
    });
    return pips;
};

const calculateRoundPoints = (state, winnerColor) => {
    const loserColor = winnerColor === 'white' ? 'black' : 'white';
    const loserBorneOff = state.bearOff[loserColor];

    // Normal Win = 1
    if (loserBorneOff > 0) return { points: 1, type: "Normal Win" };

    // Check backgammon conditions (loser in winner's home board)
    const isWinnerWhite = winnerColor === 'white';
    // Winner home indices: White home = 0..5, Black home = 18..23
    const winnerHomeIndices = isWinnerWhite ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23];

    const loserInWinnerHome = winnerHomeIndices.some(i => state.board[i].color === loserColor);
    const loserOnBar = state.bar[loserColor] > 0;

    if (loserOnBar || loserInWinnerHome) return { points: 3, type: "Backgammon" };

    return { points: 2, type: "Gammon" };
};

const resetRound = () => {
    currentState = {
        board: getInitialBoard(),
        bar: { white: 0, black: 0 },
        bearOff: { white: 0, black: 0 },
        rolledDice: [],
        unusedDice: [],
        isHumanTurn: true,
        isGameOver: false,
        winner: null,
        winType: null
    };
    el('round-result-panel').style.display = 'none';
    humanValidSequences = [];
    addLog(`--- MATCH ROUND STARTED (W ${matchScore.white} - B ${matchScore.black}) ---`);
    renderState();
};

const resetMatch = () => {
    matchScore = { white: 0, black: 0 };
    el('match-pts-white').textContent = "0";
    el('match-pts-black').textContent = "0";
    el('match-modal').style.display = 'none';
    resetRound();
};

const handleGameOver = () => {
    currentState.isGameOver = true;
    const winnerColor = currentState.bearOff.white === 15 ? 'white' : 'black';
    currentState.winner = winnerColor === 'white' ? "Human" : "AI";

    const { points, type } = calculateRoundPoints(currentState, winnerColor);
    matchScore[winnerColor] += points;

    el(`match-pts-${winnerColor}`).textContent = matchScore[winnerColor];

    if (matchScore[winnerColor] >= MATCH_TARGET) {
        // Match Over
        el('match-winner-text').textContent = `${currentState.winner} (${type}) Wins the Match!`;
        el('match-score-text').textContent = `Final Score: White ${matchScore.white} - Black ${matchScore.black}`;
        el('match-modal').style.display = 'flex';
    } else {
        // Round Over
        el('round-winnerText').textContent = `${currentState.winner} won this round!`;
        el('round-winType').textContent = `${type} (+${points} pts)`;
        el('round-result-panel').style.display = 'block';
        el('roll-btn').style.display = 'none';
    }

    addLog(`Round Over! ${currentState.winner} won by ${type} (+${points} pts)`);
    renderState();
};

const rollDice = () => {
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    return d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
};

const isHomeFullyClearAbove = (state, color, pos) => {
    const isWhite = color === 'white';
    return state.board.every((pt, i) => {
        if (pt.color !== color) return true;
        return isWhite ? i <= pos : i >= pos;
    });
};

const canBearOff = (state, color) => {
    if (state.bar[color] > 0) return false;
    const isWhite = color === 'white';
    return !state.board.some((pt, i) => {
        if (pt.color !== color) return false;
        return isWhite ? i > 5 : i < 18;
    });
};

const getSingleMoves = (state, color, remainingDice) => {
    const isWhite = color === 'white';
    const direction = isWhite ? -1 : 1;
    const uniqueDice = [...new Set(remainingDice)];
    const moves = [];

    if (state.bar[color] > 0) {
        uniqueDice.forEach(die => {
            const dest = isWhite ? 24 - die : die - 1;
            const pt = state.board[dest];
            if (pt.color === color || pt.color === null || (pt.color !== color && pt.count === 1)) {
                moves.push({ from: 'bar', to: dest, die });
            }
        });
        return moves;
    }

    state.board.forEach((pt, i) => {
        if (pt.color === color && pt.count > 0) {
            uniqueDice.forEach(die => {
                const target = i + (direction * die);
                if (target >= 0 && target <= 23) {
                    const dest = state.board[target];
                    if (dest.color === color || dest.color === null || (dest.color !== color && dest.count === 1)) {
                        moves.push({ from: i, to: target, die });
                    }
                } else if (canBearOff(state, color)) {
                    const isExact = isWhite ? target === -1 : target === 24;
                    const isOver = isWhite ? target < -1 : target > 24;
                    if (isExact || (isOver && isHomeFullyClearAbove(state, color, i))) {
                        moves.push({ from: i, to: 'bearOff', die });
                    }
                }
            });
        }
    });

    return moves;
};

const applyMove = (state, move, color) => {
    const nextState = JSON.parse(JSON.stringify(state));
    const isWhite = color === 'white';
    const oppColor = isWhite ? 'black' : 'white';

    if (move.from === 'bar') {
        nextState.bar[color]--;
    } else {
        nextState.board[move.from].count--;
        if (nextState.board[move.from].count === 0) nextState.board[move.from].color = null;
    }

    if (move.to === 'bearOff') {
        nextState.bearOff[color]++;
    } else {
        const dest = nextState.board[move.to];
        if (dest.color === oppColor && dest.count === 1) {
            dest.count = 1;
            dest.color = color;
            nextState.bar[oppColor]++;
        } else {
            dest.count++;
            dest.color = color;
        }
    }
    return nextState;
};

const getLegallyMaximalSequences = (state, color, startingDice) => {
    const paths = [];

    const search = (curState, diceLeft, currentPath) => {
        const moves = getSingleMoves(curState, color, diceLeft);
        if (moves.length === 0 || diceLeft.length === 0) {
            paths.push(currentPath);
            return;
        }

        const uniqueDice = [...new Set(diceLeft)];
        let madeMove = false;

        uniqueDice.forEach(die => {
            const typedMoves = moves.filter(m => m.die === die);
            typedMoves.forEach(m => {
                madeMove = true;
                const nextLeft = [...diceLeft];
                nextLeft.splice(nextLeft.indexOf(die), 1);
                search(applyMove(curState, m, color), nextLeft, [...currentPath, m]);
            });
        });

        if (!madeMove) paths.push(currentPath);
    };

    search(state, startingDice, []);
    if (paths.length === 0) return [];

    const maxLen = paths.reduce((max, p) => Math.max(max, p.length), 0);
    let maximal = paths.filter(p => p.length === maxLen);

    if (startingDice.length === 2 && startingDice[0] !== startingDice[1] && maxLen === 1) {
        const maxDieVal = maximal.reduce((max, p) => Math.max(max, p[0].die), 0);
        maximal = maximal.filter(p => p[0].die === maxDieVal);
    }

    return maximal;
};

const getPointNumberFromIndex = (idx) => idx + 1;

const initBoardDOM = () => {
    const createPoint = (idx, isDark) => {
        const pt = document.createElement('div');
        pt.className = `point ${isDark ? 'dark' : 'light'}`;
        pt.dataset.index = idx;
        pt.ondragover = (e) => e.preventDefault();
        pt.ondrop = handleDrop;

        // Add minimal number labels
        const lbl = document.createElement('div');
        lbl.className = 'pt-number';
        lbl.textContent = getPointNumberFromIndex(idx);
        pt.appendChild(lbl);
        return pt;
    };

    const populate = (regionKeys, parentId) => {
        const parent = el(parentId);
        regionKeys.forEach(idx => parent.appendChild(createPoint(idx, idx % 2 === 0)));
    };

    populate(REGIONS.topLeft, 'top-left');
    populate(REGIONS.topRight, 'top-right');
    populate(REGIONS.bottomLeft, 'bottom-left');
    populate(REGIONS.bottomRight, 'bottom-right');

    const droppables = [el('bear-off-top'), el('bear-off-bottom'), el('bar-top'), el('bar-bottom')];
    droppables.forEach(d => {
        d.ondragover = (e) => e.preventDefault();
        d.ondrop = handleDrop;
    });
};

const updatePipVisuals = () => {
    const pipW = calculatePipCount(currentState, 'white');
    const pipB = calculatePipCount(currentState, 'black');

    el('pip-white').textContent = `W:${pipW}`;
    el('pip-black').textContent = `B:${pipB}`;

    const advEl = el('pip-advantage');
    if (pipW === pipB) advEl.textContent = "Even Run";
    else if (pipW < pipB) advEl.textContent = `White +${pipB - pipW}`;
    else advEl.textContent = `Black +${pipW - pipB}`;
};

const renderState = () => {
    document.querySelectorAll('.point, .bar-gap, .bear-off').forEach(container => {
        Array.from(container.querySelectorAll('.checker')).forEach(c => c.remove());
    });

    const addCheckers = (count, color, wrapper, isTop) => {
        Array.from({ length: count }).forEach((_, i) => {
            const ch = document.createElement('div');
            ch.className = `checker ${color}`;
            const step = count <= 5 ? 46 : 220 / count;
            isTop ? ch.style.top = `${i * step}px` : ch.style.bottom = `${i * step}px`;

            if (currentState.isHumanTurn && color === 'white' && currentState.unusedDice.length > 0) {
                const origin = wrapper.dataset.index.startsWith('bar') ? 'bar' : wrapper.dataset.index;
                const canMove = humanValidSequences.some(seq => seq[0].from.toString() === origin);

                if (canMove && !currentState.isGameOver) {
                    ch.draggable = true;
                    ch.classList.add('selectable');
                    ch.ondragstart = (e) => handleDragStart(e, origin);
                    ch.ondragend = handleDragEnd;
                }
            }
            wrapper.appendChild(ch);
        });
    };

    currentState.board.forEach((pt, i) => {
        if (pt.count > 0) {
            const ptEl = document.querySelector(`.point[data-index="${i}"]`);
            const isTop = REGIONS.topLeft.includes(i) || REGIONS.topRight.includes(i);
            addCheckers(pt.count, pt.color, ptEl, isTop);
        }
    });

    addCheckers(currentState.bar.black, 'black', el('bar-top'), true);
    addCheckers(currentState.bar.white, 'white', el('bar-bottom'), false);
    addCheckers(currentState.bearOff.black, 'black', el('bear-off-top'), true);
    addCheckers(currentState.bearOff.white, 'white', el('bear-off-bottom'), false);

    const diceHTML = currentState.rolledDice.map(d => {
        const isUsed = !currentState.unusedDice.includes(d);
        return `<div class="die ${isUsed ? 'used-die' : ''}">${d}</div>`;
    }).join("");
    el('dice-container').innerHTML = diceHTML;

    el('score-white').textContent = currentState.bearOff.white;
    el('score-black').textContent = currentState.bearOff.black;
    updatePipVisuals();

    el('card-white').classList.toggle('active-turn', !currentState.isGameOver && currentState.isHumanTurn);
    el('card-black').classList.toggle('active-turn', !currentState.isGameOver && !currentState.isHumanTurn);

    if (currentState.isGameOver) {
        el('status').textContent = "Round Finished";
    } else {
        el('status').textContent = currentState.isHumanTurn ? "Your Turn (White)" : "AI Turn (Black)";
        el('roll-btn').style.display = (currentState.isHumanTurn && currentState.unusedDice.length === 0 && !currentState.isGameOver) ? 'block' : 'none';
    }
};

const handleDragStart = (e, index) => {
    e.dataTransfer.setData('text/plain', index);
    const validDests = [...new Set(humanValidSequences.filter(s => s[0].from.toString() === index).map(s => s[0].to.toString()))];

    validDests.forEach(dest => {
        const targetEl = dest === 'bearOff' ? el('bear-off-bottom') : document.querySelector(`.point[data-index="${dest}"]`);
        if (targetEl) targetEl.classList.add('highlight');
    });
};

const handleDragEnd = () => {
    document.querySelectorAll('.highlight').forEach(e => e.classList.remove('highlight'));
};

const handleDrop = (e) => {
    e.preventDefault();
    if (currentState.isGameOver) return;

    handleDragEnd();
    let toTarget = e.currentTarget.dataset.index;
    const fromIndex = e.dataTransfer.getData('text/plain');
    if (!fromIndex) return;
    if (toTarget === 'bearOffWhite') toTarget = 'bearOff';

    const matchingSeq = humanValidSequences.find(s => s[0].from.toString() === fromIndex && s[0].to.toString() === toTarget);

    if (matchingSeq) {
        const move = matchingSeq[0];
        currentState.unusedDice.splice(currentState.unusedDice.indexOf(move.die), 1);
        currentState = applyMove(currentState, move, 'white');

        let pMoved = move.from === 'bar' ? 'Bar' : `Pt ${getPointNumberFromIndex(parseInt(move.from))}`;
        let pDest = move.to === 'bearOff' ? 'Bear Off' : `Pt ${getPointNumberFromIndex(parseInt(move.to))}`;
        addLog(`Human moves ${pMoved} \u2192 ${pDest} (Used ${move.die})`);

        if (currentState.bearOff.white === 15) {
            handleGameOver();
        } else {
            humanValidSequences = getLegallyMaximalSequences(currentState, 'white', currentState.unusedDice);
            if (currentState.unusedDice.length === 0 || humanValidSequences.length === 0 || humanValidSequences[0].length === 0) {
                if (humanValidSequences.length === 0 || humanValidSequences[0].length === 0) {
                    addLog(currentState.unusedDice.length > 0 ? "No more legal moves for Human." : "Turn completed.");
                    currentState.unusedDice = [];
                }
                currentState.isHumanTurn = false;
                setTimeout(playAITurn, 1000);
            }
        }
        renderState();
    }
};

el('roll-btn').onclick = () => {
    if (currentState.isGameOver) return;
    const r = rollDice();
    currentState.rolledDice = r;
    currentState.unusedDice = [...r];
    addLog(`Human rolls ${currentState.unusedDice.join(", ")}`);

    humanValidSequences = getLegallyMaximalSequences(currentState, 'white', currentState.unusedDice);
    if (humanValidSequences.length === 0 || humanValidSequences[0].length === 0) {
        addLog("No legal moves possible for Human. Skipping turn.");
        currentState.unusedDice = [];
        currentState.isHumanTurn = false;
        setTimeout(playAITurn, 1500);
    }
    renderState();
};

const generateBoardDescription = () => {
    const lines = [
        "White(Human) vs Black(AI, You).",
        `Bar -> Black: ${currentState.bar.black}, White: ${currentState.bar.white}`,
        `BearOff -> Black: ${currentState.bearOff.black}, White: ${currentState.bearOff.white}`
    ];
    currentState.board.forEach((pt, i) => {
        if (pt.count > 0) lines.push(`Point ${i}: ${pt.count} ${pt.color}`);
    });
    return lines.join("\n");
};

const executeAISequence = (seq, rationale) => {
    if (currentState.isGameOver) return;
    if (rationale) addLog(`AI Logic: ${rationale}`, false, true);

    const applyNext = (moves) => {
        if (moves.length === 0) {
            currentState.unusedDice = [];
            if (currentState.bearOff.black === 15) {
                handleGameOver();
            } else {
                currentState.isHumanTurn = true;
                humanValidSequences = [];
            }
            renderState();
            return;
        }

        const m = moves[0];
        currentState.unusedDice.splice(currentState.unusedDice.indexOf(m.die), 1);
        currentState = applyMove(currentState, m, 'black');

        let pMoved = m.from === 'bar' ? 'Bar' : `Pt ${getPointNumberFromIndex(parseInt(m.from))}`;
        let pDest = m.to === 'bearOff' ? 'Bear Off' : `Pt ${getPointNumberFromIndex(parseInt(m.to))}`;
        addLog(`AI moves ${pMoved} \u2192 ${pDest} (Used ${m.die})`);

        renderState();
        setTimeout(() => applyNext(moves.slice(1)), 800);
    };

    applyNext(seq);
};

const pickFallbackSequence = (seqs) => {
    return seqs.reduce((best, seq) => {
        let st = currentState;
        seq.forEach(m => st = applyMove(st, m, 'black'));

        const hits = st.bar.white;
        const bears = st.bearOff.black * 100;
        const progress = st.board.reduce((acc, pt, i) => acc + (pt.color === 'black' ? (i + 1) * pt.count : 0), 0);

        const score = hits * 10 + bears + progress;
        return score > best.score ? { seq, score } : best;
    }, { seq: seqs[0], score: -1 }).seq;
};

const playAITurn = async () => {
    if (currentState.isGameOver) return;
    const rolled = rollDice();
    currentState.rolledDice = rolled;
    currentState.unusedDice = [...rolled];
    addLog(`AI rolls ${rolled.join(", ")}`);
    renderState();

    const seqs = getLegallyMaximalSequences(currentState, 'black', currentState.unusedDice);
    if (seqs.length === 0 || seqs[0].length === 0) {
        addLog("AI has no legal moves. Skipping turn.");
        currentState.unusedDice = [];
        currentState.isHumanTurn = true;
        renderState();
        return;
    }

    const stateDesc = generateBoardDescription();
    const mappings = seqs.map((s, i) => {
        const trace = s.map(m => `From ${m.from} to ${m.to} (die ${m.die})`).join(" -> ");
        return `[Index ${i}]: ${trace}`;
    }).join("\n");

    const prompt = `You are playing Backgammon as Black.
${stateDesc}
Rolled: ${rolled.join(", ")}
Available maximal move sequences:
${mappings}

Respond strictly with the numeric choiceIndex of the sequence you want to deploy, and a brief strategic explanation.`;

    try {
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${memoryApiKey}`
            },
            body: JSON.stringify({
                model: MODEL_NAME,
                input: prompt,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        name: "move_selection",
                        strict: true,
                        schema: {
                            type: "object",
                            properties: {
                                choiceIndex: { type: "integer", minimum: 0 },
                                explanation: { type: "string" }
                            },
                            required: ["choiceIndex", "explanation"],
                            additionalProperties: false
                        }
                    }
                }
            })
        });

        if (!response.ok) throw new Error(await response.text());
        const json = await response.json();

        let parsed = null;
        if (json.choices && json.choices[0] && json.choices[0].message) {
            parsed = JSON.parse(json.choices[0].message.content);
        } else {
            parsed = JSON.parse(json.output || json.content || JSON.stringify(json));
        }

        const chosenIndex = parsed.choiceIndex !== undefined ? parsed.choiceIndex : 0;
        if (chosenIndex >= 0 && chosenIndex < seqs.length) {
            executeAISequence(seqs[chosenIndex], parsed.explanation);
        } else {
            throw new Error("Model returned out of bounds index.");
        }
    } catch (e) {
        addLog("Network/API Error attempting to contact OpenAI.", true);
        if (e.message.includes('CORS') || e.message.includes('Failed to fetch')) {
            addLog("Hint: Browser blocked request.", true);
        }
        executeAISequence(pickFallbackSequence(seqs), "Fallback: local computation due to API failure.");
    }
};

el('api-save-btn').onclick = () => {
    const input = el('api-key-input').value.trim();
    if (!input.startsWith('sk-')) {
        el('api-error').textContent = "Invalid API Key format.";
        return;
    }
    memoryApiKey = input;
    el('api-modal').style.display = 'none';
    el('game-container').style.display = 'flex';

    initBoardDOM();
    resetMatch();
};

el('next-round-btn').onclick = resetRound;
el('new-match-btn').onclick = resetMatch;
