const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');

const appRoutes = [
  '/',
  '/game',
  '/results',
  '/definitions',
  '/cases',
  '/debate',
  '/simulator',
  '/closing',
];

const villages = new Map();
const activeParticipantSockets = new Map();

const defaultSettings = {
  roundsCount: 3,
  killersCount: 1,
  discussionTimeSeconds: 120,
  votingTimeSeconds: 45,
};

const statusLabels = {
  waiting: 'Esperando jugadores',
  setup: 'Pueblo completo',
  live: 'Partida iniciada',
};

const roleLabels = {
  killer: 'Asesino',
  villager: 'Vecino',
};

const phaseLabels = {
  lobby: 'Esperando jugadores',
  roleReveal: 'Revelación de roles',
  night: 'Noche',
  nightClosed: 'Noche cerrada',
  day: 'Pueblo despierto',
  discussion: 'Discusión',
  voting: 'Votación',
  votingClosed: 'Votación cerrada',
  finalResults: 'Resultados finales',
};

const NO_KILL_TARGET = '__NO_KILL__';
const NO_VOTE_TARGET = '__NO_VOTE__';

function normalizeParticipantId(participantId) {
  return String(participantId || '').trim().slice(0, 80);
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 40);
}

function normalizeVillageName(name) {
  return String(name || '').trim().slice(0, 60);
}

function normalizeVillageCode(code) {
  return String(code || '').trim().toUpperCase();
}

function toNumberInRange(value, fallback, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(Math.max(Math.round(number), min), max);
}

function normalizeSettings(settings = {}) {
  return {
    roundsCount: toNumberInRange(settings.roundsCount, defaultSettings.roundsCount, 1, 10),
    killersCount: toNumberInRange(settings.killersCount, defaultSettings.killersCount, 1, 10),
    discussionTimeSeconds: toNumberInRange(settings.discussionTimeSeconds, defaultSettings.discussionTimeSeconds, 15, 600),
    votingTimeSeconds: toNumberInRange(settings.votingTimeSeconds, defaultSettings.votingTimeSeconds, 10, 300),
  };
}

function getMaxKillersCount(playersCount) {
  return Math.max(Math.floor((playersCount - 1) / 3), 1);
}

function validatePlayableSettings(village, settings) {
  const currentPlayers = village.players.length;
  const killersCount = settings.killersCount;
  const villagersCount = currentPlayers - killersCount;
  const maxKillersCount = getMaxKillersCount(currentPlayers);
  const villagersAfterFullNight = villagersCount - killersCount;

  if (currentPlayers < 3) {
    return 'Debe haber al menos 3 jugadores para configurar una partida equilibrada.';
  }

  if (killersCount > maxKillersCount || villagersAfterFullNight <= killersCount) {
    return `La partida quedaría desequilibrada tras la primera noche. Con ${currentPlayers} jugadores, el máximo recomendado de asesinos es ${maxKillersCount}.`;
  }

  return null;
}

function generateVillageCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  do {
    code = Array.from({ length: 5 }, () => {
      const index = Math.floor(Math.random() * alphabet.length);
      return alphabet[index];
    }).join('');
  } while (villages.has(code));

  return code;
}

function shuffleArray(items) {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffledItems[index], shuffledItems[randomIndex]] = [shuffledItems[randomIndex], shuffledItems[index]];
  }

  return shuffledItems;
}

function clearPlayerRoles(village) {
  village.players = village.players.map((player) => ({
    ...player,
    role: null,
  }));
}

function assignRolesToPlayers(village) {
  clearPlayerRoles(village);

  const shuffledPlayers = shuffleArray(village.players);
  const killersCount = village.settings.killersCount;
  const killerParticipantIds = new Set(
    shuffledPlayers.slice(0, killersCount).map((player) => player.participantId)
  );

  village.players = village.players.map((player) => ({
    ...player,
    role: killerParticipantIds.has(player.participantId) ? 'killer' : 'villager',
  }));
}

function getPublicVillagesList() {
  return Array.from(villages.values()).map((village) => ({
    code: village.code,
    name: village.name,
    status: village.status,
    statusLabel: statusLabels[village.status] || village.status,
    currentPlayers: village.players.length,
    narrator: {
      name: village.narrator.name,
      connected: village.narrator.connected,
    },
    createdAt: village.createdAt,
  }));
}

function getEliminationReasonLabel(reason) {
  const labels = {
    killedByKillers: 'eliminado por los asesinos',
    expelledByVote: 'expulsado por votación',
  };

  return labels[reason] || null;
}

function createPhaseTimer(phase, durationSeconds) {
  const safeDurationSeconds = toNumberInRange(durationSeconds, 0, 1, 3600);
  const startedAt = Date.now();
  const endsAt = startedAt + safeDurationSeconds * 1000;

  return {
    phase,
    durationSeconds: safeDurationSeconds,
    startedAt,
    endsAt,
  };
}

function getPublicPhaseTimer(village) {
  const timer = village.phaseTimer;

  if (!timer || timer.phase !== village.phase) {
    return null;
  }

  const remainingSeconds = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));

  return {
    ...timer,
    remainingSeconds,
    expired: remainingSeconds === 0,
  };
}

function getPublicVillageState(village) {
  return {
    code: village.code,
    name: village.name,
    status: village.status,
    statusLabel: statusLabels[village.status] || village.status,
    phase: village.phase,
    phaseLabel: phaseLabels[village.phase] || village.phase,
    phaseMessage: getPublicPhaseMessage(village),
    phaseTimer: getPublicPhaseTimer(village),
    settings: {
      roundsCount: village.settings?.roundsCount,
      killersCount: village.settings?.killersCount,
      discussionTimeSeconds: village.settings?.discussionTimeSeconds,
      votingTimeSeconds: village.settings?.votingTimeSeconds,
    },
    narrator: {
      name: village.narrator.name,
      connected: village.narrator.connected,
    },
    players: village.players.map((player) => ({
      participantId: player.participantId,
      name: player.name,
      connected: player.connected,
      alive: player.alive !== false,
      eliminationReason: player.eliminationReason || null,
      eliminationReasonLabel: getEliminationReasonLabel(player.eliminationReason),
    })),
    currentPlayers: village.players.length,
    nightActions: getNightActionsSummary(village),
    publicNightResult: getPublicNightResult(village),
    voting: getPublicVotingState(village),
    classificationSummary: village.phase === 'finalResults'
      ? village.finalClassificationSummary || calculateClassificationMetrics(village)
      : null,
    finalReport: village.phase === 'finalResults'
      ? village.finalReport || buildFinalReport(village)
      : null,
    lastCompletedGameReport: village.lastCompletedGameReport || null,
    lastCompletedClassificationSummary: village.lastCompletedClassificationSummary || null,
    currentRound: village.currentRound || 1,
    createdAt: village.createdAt,
  };
}

function getPublicPhaseMessage(village) {
  if (village.phase === 'roleReveal') {
    return 'Los jugadores están viendo qué roles les ha tocado.';
  }

  if (village.phase === 'night') {
    return 'El pueblo duerme. Los jugadores mantienen los ojos cerrados.';
  }

  if (village.phase === 'nightClosed') {
    return 'La noche ha terminado. El narrador debe levantar al pueblo.';
  }

  if (village.phase === 'day') {
    return 'El pueblo despierta. Se muestran públicamente las bajas de la noche.';
  }

  if (village.phase === 'discussion') {
    return 'El pueblo debate quién puede ser sospechoso.';
  }

  if (village.phase === 'voting') {
    return 'El pueblo vota. Solo los jugadores vivos pueden votar.';
  }

  if (village.phase === 'votingClosed') {
    return 'La votación ha terminado. El narrador puede revisar el resultado.';
  }

  return 'El pueblo está esperando jugadores.';
}

function getNightActionsSummary(village) {
  const requiredActions = village.players
    .filter((player) => player.role === 'killer')
    .filter((player) => player.alive !== false)
    .length;

  const completedActions = Object.keys(village.nightActions || {}).length;

  return {
    requiredActions,
    completedActions,
  };
}

function getTargetNameById(village, targetId) {
  if (targetId === NO_KILL_TARGET) {
    return 'No matar a nadie';
  }

  const target = village.players.find((candidate) => candidate.participantId === targetId);
  return target?.name || null;
}

function getTargetSelectionCounts(village) {
  return Object.values(village.nightActions || {}).reduce((counts, targetId) => {
    if (!targetId) {
      return counts;
    }

    counts[targetId] = (counts[targetId] || 0) + 1;
    return counts;
  }, {});
}

function getKillerActionSummary(village, player) {
  const hasChosen = Object.prototype.hasOwnProperty.call(village.nightActions || {}, player.participantId);
  const selectedTargetId = village.nightActions?.[player.participantId] || null;
  const selectedTargetName = hasChosen ? getTargetNameById(village, selectedTargetId) : 'Sin elegir';

  return {
    name: player.name,
    participantId: player.participantId,
    completed: hasChosen,
    selectedTargetId,
    selectedTargetName,
  };
}

function buildNightResult(village) {
  const targetCounts = getTargetSelectionCounts(village);

  const actions = village.players
    .filter((player) => player.role === 'killer')
    .filter((player) => player.alive !== false)
    .map((killer) => {
      const action = getKillerActionSummary(village, killer);
      const selectedCount = action.selectedTargetId ? targetCounts[action.selectedTargetId] || 0 : 0;

      return {
        killerName: killer.name,
        completed: action.completed,
        targetId: action.selectedTargetId,
        targetName: action.selectedTargetName,
        selectedCount,
        noKill: action.selectedTargetId === NO_KILL_TARGET,
      };
    });

  const casualties = Object.entries(targetCounts)
    .filter(([targetId]) => targetId !== NO_KILL_TARGET)
    .map(([targetId, selectedCount]) => {
      const target = village.players.find((player) => player.participantId === targetId);

      if (!target) {
        return null;
      }

      return {
        participantId: target.participantId,
        name: target.name,
        selectedCount,
      };
    })
    .filter(Boolean);

  const repeatedTargets = casualties
    .filter((casualty) => casualty.selectedCount > 1)
    .map((casualty) => ({
      name: casualty.name,
      selectedCount: casualty.selectedCount,
    }));

  return {
    actions,
    casualties,
    repeatedTargets,
    noKillCount: targetCounts[NO_KILL_TARGET] || 0,
  };
}

function getPublicNightResult(village) {
  if (!['day', 'discussion', 'voting'].includes(village.phase)) {
    return null;
  }

  return village.publicNightResult || null;
}

function getKillerTeammates(village, player) {
  if (player.role !== 'killer') {
    return [];
  }

  return village.players
    .filter((candidate) => candidate.role === 'killer')
    .filter((candidate) => candidate.participantId !== player.participantId)
    .map((candidate) => ({
      name: candidate.name,
    }));
}

function getKillerTeamActions(village, player) {
  if (player.role !== 'killer') {
    return [];
  }

  const targetCounts = getTargetSelectionCounts(village);

  return village.players
    .filter((candidate) => candidate.role === 'killer')
    .filter((candidate) => candidate.alive !== false)
    .map((candidate) => {
      const action = getKillerActionSummary(village, candidate);
      const selectedCount = action.selectedTargetId ? targetCounts[action.selectedTargetId] || 0 : 0;

      return {
        ...action,
        selectedCount,
        isYou: candidate.participantId === player.participantId,
      };
    });
}

function getAvailableNightTargets(village, player) {
  const targetCounts = getTargetSelectionCounts(village);

  return village.players
    .filter((candidate) => candidate.alive !== false)
    .filter((candidate) => candidate.participantId !== player.participantId)
    .filter((candidate) => candidate.role !== 'killer')
    .map((candidate) => ({
      targetId: candidate.participantId,
      name: candidate.name,
      selectedCount: targetCounts[candidate.participantId] || 0,
    }));
}

function getPrivateNightAction(village, player) {
  if (village.phase !== 'night') {
    return null;
  }

  if (player.role !== 'killer') {
    return {
      type: 'none',
      message: 'Eres vecino. Durante la noche no tienes ninguna acción. Espera a que el pueblo despierte.',
    };
  }

  const hasChosen = Object.prototype.hasOwnProperty.call(village.nightActions || {}, player.participantId);
  const selectedTargetId = village.nightActions?.[player.participantId] || null;

  return {
    type: 'chooseVictim',
    message: 'Eres asesino. Elige en privado a qué vecino quieres atacar esta noche, o decide no matar a nadie.',
    completed: hasChosen,
    selectedTargetId,
    selectedTargetName: hasChosen ? getTargetNameById(village, selectedTargetId) : null,
    noKillSelectedCount: getTargetSelectionCounts(village)[NO_KILL_TARGET] || 0,
    teammates: getKillerTeammates(village, player),
    teamActions: getKillerTeamActions(village, player),
    targets: getAvailableNightTargets(village, player),
  };
}

function clearRoundState(village) {
  village.phaseTimer = null;
  village.finalReport = null;
  village.finalClassificationSummary = null;
  village.nightActions = {};
  village.pendingNightResult = null;
  village.publicNightResult = null;
  village.votes = {};
  village.lastVotingResult = null;
  village.votingRound = 1;
  village.runoffTargetIds = null;
}

function getAlivePlayers(village) {
  return village.players.filter((player) => player.alive !== false);
}


function getVotingCandidates(village) {
  const alivePlayers = getAlivePlayers(village);

  if (village.votingRound === 2 && Array.isArray(village.runoffTargetIds)) {
    const runoffIds = new Set(village.runoffTargetIds);
    return alivePlayers.filter((player) => runoffIds.has(player.participantId));
  }

  return alivePlayers;
}

function getVotingTargetsForPlayer(village, participantId) {
  return getAlivePlayers(village)
    .filter((player) => player.participantId !== participantId)
    .map((player) => ({
      participantId: player.participantId,
      name: player.name,
    }));
}

function buildVotingResult(village) {
  const votes = village.votes || {};
  const alivePlayers = getAlivePlayers(village);
  const alivePlayerIds = new Set(alivePlayers.map((player) => player.participantId));
  const candidates = getVotingCandidates(village);
  const candidateIds = new Set(candidates.map((player) => player.participantId));
  const votingRound = village.votingRound || 1;
  const isRunoff = votingRound === 2;

  const submittedVotes = Object.entries(votes).filter(([voterId, targetId]) => {
    if (!alivePlayerIds.has(voterId)) {
      return false;
    }

    if (targetId === NO_VOTE_TARGET) {
      return true;
    }

    return candidateIds.has(targetId) && voterId !== targetId;
  });

  const noVoteCount = submittedVotes.filter(([, targetId]) => targetId === NO_VOTE_TARGET).length;
  const noVoteHasAbsoluteMajority = isRunoff && noVoteCount > alivePlayers.length / 2;

  const votesForExpulsion = submittedVotes.filter(([, targetId]) => targetId !== NO_VOTE_TARGET);

  const voteCounts = votesForExpulsion.reduce((counts, [, targetId]) => {
    counts[targetId] = (counts[targetId] || 0) + 1;
    return counts;
  }, {});

  const publicVotes = submittedVotes.map(([voterId, targetId]) => {
    const voter = village.players.find((player) => player.participantId === voterId);
    const target = village.players.find((player) => player.participantId === targetId);

    return {
      voterId,
      voterName: voter?.name || 'Jugador desconocido',
      targetId,
      targetName: targetId === NO_VOTE_TARGET ? 'No votar a nadie' : target?.name || 'Objetivo desconocido',
      noVote: targetId === NO_VOTE_TARGET,
    };
  });

  const results = candidates
    .map((player) => ({
      participantId: player.participantId,
      name: player.name,
      votesCount: voteCounts[player.participantId] || 0,
    }))
    .sort((first, second) => second.votesCount - first.votesCount || first.name.localeCompare(second.name));

  const maxVotes = results.length > 0 ? results[0].votesCount : 0;
  const tiedTargets = maxVotes > 0 ? results.filter((result) => result.votesCount === maxVotes) : [];
  const hasTie = tiedTargets.length > 1;
  const requiresRunoff = !isRunoff && hasTie;
  const expelledPlayers = [];

  if (!noVoteHasAbsoluteMajority && !requiresRunoff && tiedTargets.length === 1) {
    expelledPlayers.push(tiedTargets[0]);
  }

  if (!noVoteHasAbsoluteMajority && isRunoff && hasTie) {
    expelledPlayers.push(...tiedTargets);
  }

  const votersWhoVoted = new Set(submittedVotes.map(([voterId]) => voterId));
  const missingVoters = alivePlayers
    .filter((player) => !votersWhoVoted.has(player.participantId))
    .map((player) => ({
      participantId: player.participantId,
      name: player.name,
    }));

  return {
    votingRound,
    isRunoff,
    eligibleVotersCount: alivePlayers.length,
    submittedVotesCount: submittedVotes.length,
    noVoteCount,
    noVoteHasAbsoluteMajority,
    savedByNoVote: noVoteHasAbsoluteMajority,
    missingVoters,
    publicVotes,
    results,
    tiedTargets: tiedTargets.map((target) => ({
      participantId: target.participantId,
      name: target.name,
      votesCount: target.votesCount,
    })),
    hasTie,
    requiresRunoff,
    runoffTargetIds: requiresRunoff ? tiedTargets.map((target) => target.participantId) : [],
    expelled: expelledPlayers.length === 1 ? expelledPlayers[0] : null,
    expelledPlayers,
  };
}


function getClassificationOutcome(predictedAsKiller, actualIsKiller) {
  if (predictedAsKiller && actualIsKiller) {
    return 'TP';
  }

  if (predictedAsKiller && !actualIsKiller) {
    return 'FP';
  }

  if (!predictedAsKiller && !actualIsKiller) {
    return 'TN';
  }

  return 'FN';
}

function buildVotingClassificationEvents(village, votingResult) {
  const candidates = getVotingCandidates(village);
  const submittedVotes = votingResult.publicVotes || [];
  const events = [];

  submittedVotes.forEach((vote) => {
    const voter = village.players.find((player) => player.participantId === vote.voterId);

    if (!voter || voter.alive === false) {
      return;
    }

    candidates.forEach((candidate) => {
      if (candidate.participantId === voter.participantId) {
        return;
      }

      const predictedAsKiller = vote.targetId === candidate.participantId;
      const actualIsKiller = candidate.role === 'killer';

      events.push({
        round: village.currentRound || 1,
        votingRound: votingResult.votingRound || 1,
        isRunoff: votingResult.isRunoff || false,
        voterId: voter.participantId,
        voterName: voter.name,
        candidateId: candidate.participantId,
        candidateName: candidate.name,
        voteTargetId: vote.targetId,
        voteTargetName: vote.targetName,
        predictedAsKiller,
        actualIsKiller,
        actualRole: candidate.role,
        outcome: getClassificationOutcome(predictedAsKiller, actualIsKiller),
      });
    });
  });

  return events;
}

function appendVotingHistory(village, votingResult) {
  if (!Array.isArray(village.votingHistory)) {
    village.votingHistory = [];
  }

  if (!Array.isArray(village.classificationEvents)) {
    village.classificationEvents = [];
  }

  const classificationEvents = buildVotingClassificationEvents(village, votingResult);

  village.votingHistory.push({
    round: village.currentRound || 1,
    votingRound: votingResult.votingRound || 1,
    isRunoff: votingResult.isRunoff || false,
    eligibleVotersCount: votingResult.eligibleVotersCount,
    submittedVotesCount: votingResult.submittedVotesCount,
    noVoteCount: votingResult.noVoteCount || 0,
    savedByNoVote: votingResult.savedByNoVote || false,
    requiresRunoff: votingResult.requiresRunoff || false,
    publicVotes: votingResult.publicVotes || [],
    results: votingResult.results || [],
    tiedTargets: votingResult.tiedTargets || [],
    expelledPlayers: votingResult.expelledPlayers || [],
    classificationEventsCount: classificationEvents.length,
  });

  village.classificationEvents.push(...classificationEvents);
}


function safeDivide(numerator, denominator) {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

function roundMetric(value) {
  return Math.round(value * 1000) / 1000;
}

function calculateClassificationMetrics(village) {
  const players = village.players || [];

  const finalEvents = players.map((player) => {
    const predictedAsKiller = player.eliminationReason === 'expelledByVote';
    const actualIsKiller = player.role === 'killer';

    return {
      participantId: player.participantId,
      name: player.name,
      predictedAsKiller,
      actualIsKiller,
      outcome: getClassificationOutcome(predictedAsKiller, actualIsKiller),
    };
  });

  const confusion = finalEvents.reduce(
    (counts, event) => {
      if (event.outcome === 'TP') {
        counts.truePositives += 1;
      } else if (event.outcome === 'FP') {
        counts.falsePositives += 1;
      } else if (event.outcome === 'TN') {
        counts.trueNegatives += 1;
      } else if (event.outcome === 'FN') {
        counts.falseNegatives += 1;
      }

      return counts;
    },
    {
      truePositives: 0,
      falsePositives: 0,
      trueNegatives: 0,
      falseNegatives: 0,
    }
  );

  const total =
    confusion.truePositives +
    confusion.falsePositives +
    confusion.trueNegatives +
    confusion.falseNegatives;

  const accuracy = safeDivide(confusion.truePositives + confusion.trueNegatives, total);
  const precision = safeDivide(confusion.truePositives, confusion.truePositives + confusion.falsePositives);
  const recall = safeDivide(confusion.truePositives, confusion.truePositives + confusion.falseNegatives);
  const f1Score = safeDivide(2 * precision * recall, precision + recall);

  return {
    mode: 'finalClassification',
    positiveClass: 'killer',
    predictionRule: 'expelledByVote',
    totalEvents: total,
    confusion,
    metrics: {
      accuracy: roundMetric(accuracy),
      precision: roundMetric(precision),
      recall: roundMetric(recall),
      f1Score: roundMetric(f1Score),
    },
  };
}


function buildFinalReport(village) {
  const players = (village.players || []).map((player) => ({
    participantId: player.participantId,
    name: player.name,
    role: player.role,
    roleLabel: player.role === 'killer' ? 'Asesino' : 'Vecino',
    alive: player.alive !== false,
    eliminationReason: player.eliminationReason || null,
    eliminationReasonLabel: getEliminationReasonLabel(player.eliminationReason),
  }));

  const survivors = players.filter((player) => player.alive);
  const killedByKillers = players.filter((player) => player.eliminationReason === 'killedByKillers');
  const expelledByVote = players.filter((player) => player.eliminationReason === 'expelledByVote');
  const discoveredKillers = players.filter(
    (player) => player.role === 'killer' && player.eliminationReason === 'expelledByVote'
  );
  const escapedKillers = players.filter(
    (player) => player.role === 'killer' && player.eliminationReason !== 'expelledByVote'
  );
  const wronglyExpelledVillagers = players.filter(
    (player) => player.role !== 'killer' && player.eliminationReason === 'expelledByVote'
  );

  const neighbors = players.filter((player) => player.role !== 'killer');
  const killers = players.filter((player) => player.role === 'killer');
  const aliveNeighbors = neighbors.filter((player) => player.alive);
  const killedNeighbors = neighbors.filter((player) => player.eliminationReason === 'killedByKillers');

  return {
    winner: escapedKillers.length === 0 ? 'villagers' : 'killers',
    winnerLabel: escapedKillers.length === 0 ? 'Gana el pueblo' : 'Ganan los asesinos',
    summary: {
      totalPlayers: players.length,
      totalNeighbors: neighbors.length,
      totalKillers: killers.length,
      aliveNeighbors: aliveNeighbors.length,
      killedNeighbors: killedNeighbors.length,
      wronglyExpelledNeighbors: wronglyExpelledVillagers.length,
      discoveredKillers: discoveredKillers.length,
      escapedKillers: escapedKillers.length,
    },
    groups: {
      survivors,
      killedByKillers,
      expelledByVote,
      discoveredKillers,
      escapedKillers,
      wronglyExpelledVillagers,
    },
  };
}


function getVictoryState(village) {
  const alivePlayers = getAlivePlayers(village);
  const aliveKillers = alivePlayers.filter((player) => player.role === 'killer');
  const aliveNeighbors = alivePlayers.filter((player) => player.role !== 'killer');

  if (aliveKillers.length === 0) {
    return {
      finished: true,
      winner: 'villagers',
      winnerLabel: 'Gana el pueblo',
      reason: 'allKillersCaught',
      reasonLabel: 'El pueblo ha descubierto a todos los asesinos.',
      aliveKillersCount: aliveKillers.length,
      aliveNeighborsCount: aliveNeighbors.length,
      aliveVillagersCount: aliveNeighbors.length,
    };
  }

  if (aliveKillers.length >= aliveNeighbors.length) {
    return {
      finished: true,
      winner: 'killers',
      winnerLabel: 'Ganan los asesinos',
      reason: 'killersReachedParity',
      reasonLabel: 'Los asesinos vivos igualan o superan a los vecinos vivos.',
      aliveKillersCount: aliveKillers.length,
      aliveNeighborsCount: aliveNeighbors.length,
      aliveVillagersCount: aliveNeighbors.length,
    };
  }

  return {
    finished: false,
    winner: null,
    winnerLabel: null,
    reason: null,
    reasonLabel: null,
    aliveKillersCount: aliveKillers.length,
    aliveNeighborsCount: aliveNeighbors.length,
    aliveVillagersCount: aliveNeighbors.length,
  };
}

function storeFinalReport(village, victoryState = null) {
  const finalClassificationSummary = calculateClassificationMetrics(village);
  const baseReport = buildFinalReport(village);

  village.finalClassificationSummary = finalClassificationSummary;
  village.finalReport = {
    ...baseReport,
    winner: victoryState?.winner || baseReport.winner,
    winnerLabel: victoryState?.winnerLabel || baseReport.winnerLabel,
    victoryReason: victoryState?.reason || null,
    victoryReasonLabel: victoryState?.reasonLabel || null,
    aliveKillersCount: victoryState?.aliveKillersCount,
    aliveNeighborsCount: victoryState?.aliveNeighborsCount ?? victoryState?.aliveVillagersCount,
    aliveVillagersCount: victoryState?.aliveVillagersCount,
    classificationSummary: finalClassificationSummary,
    generatedAt: new Date().toISOString(),
  };

  village.lastCompletedGameReport = village.finalReport;
  village.lastCompletedClassificationSummary = village.finalClassificationSummary;
}

function finishVillageIfVictory(village) {
  const victoryState = getVictoryState(village);

  if (!victoryState.finished) {
    return victoryState;
  }

  storeFinalReport(village, victoryState);
  village.phase = 'finalResults';
  village.phaseTimer = null;

  return victoryState;
}

function applyVotingResult(village, votingResult) {
  const expelledPlayers = votingResult?.expelledPlayers || [];

  if (expelledPlayers.length === 0) {
    return;
  }

  const expelledIds = new Set(expelledPlayers.map((player) => player.participantId));

  village.players = village.players.map((player) => {
    if (!expelledIds.has(player.participantId)) {
      return player;
    }

    return {
      ...player,
      alive: false,
      eliminationReason: 'expelledByVote',
    };
  });
}

function getPublicVotingState(village) {
  const votes = village.votes || {};
  const alivePlayers = getAlivePlayers(village);
  const alivePlayerIds = new Set(alivePlayers.map((player) => player.participantId));
  const candidates = getVotingCandidates(village);
  const candidateIds = new Set(candidates.map((player) => player.participantId));
  const votingRound = village.votingRound || 1;
  const isRunoff = votingRound === 2;

  if (village.phase === 'votingClosed' && village.lastVotingResult) {
    return {
      votingRound: village.lastVotingResult.votingRound || votingRound,
      isRunoff: village.lastVotingResult.isRunoff || false,
      eligibleVotersCount: village.lastVotingResult.eligibleVotersCount,
      submittedVotesCount: village.lastVotingResult.submittedVotesCount,
      noVoteCount: village.lastVotingResult.noVoteCount || 0,
      noVoteHasAbsoluteMajority: village.lastVotingResult.noVoteHasAbsoluteMajority || false,
      savedByNoVote: village.lastVotingResult.savedByNoVote || false,
      targets: candidates.map((player) => ({
        participantId: player.participantId,
        name: player.name,
      })),
      publicVotes: village.lastVotingResult.publicVotes || [],
      result: village.lastVotingResult,
    };
  }

  const publicVotes = Object.entries(votes)
    .filter(([voterId, targetId]) => {
      if (!alivePlayerIds.has(voterId)) {
        return false;
      }

      if (targetId === NO_VOTE_TARGET) {
        return true;
      }

      return candidateIds.has(targetId) && voterId !== targetId;
    })
    .map(([voterId, targetId]) => {
      const voter = village.players.find((player) => player.participantId === voterId);
      const target = village.players.find((player) => player.participantId === targetId);

      return {
        voterId,
        voterName: voter?.name || 'Jugador desconocido',
        targetId,
        targetName: targetId === NO_VOTE_TARGET ? 'No votar a nadie' : target?.name || 'Objetivo desconocido',
        noVote: targetId === NO_VOTE_TARGET,
      };
    });

  return {
    votingRound,
    isRunoff,
    eligibleVotersCount: alivePlayers.length,
    submittedVotesCount: publicVotes.length,
    noVoteCount: publicVotes.filter((vote) => vote.noVote).length,
    noVoteHasAbsoluteMajority: false,
    savedByNoVote: false,
    targets: candidates.map((player) => ({
      participantId: player.participantId,
      name: player.name,
    })),
    publicVotes,
    result: null,
  };
}

function getPrivatePlayerState(village, participantId) {
  const player = village.players.find((candidate) => candidate.participantId === participantId);

  if (!player || !player.role) {
    return null;
  }

  return {
    villageCode: village.code,
    villageName: village.name,
    playerName: player.name,
    role: player.role,
    roleLabel: roleLabels[player.role] || player.role,
    teammates: getKillerTeammates(village, player),
    phase: village.phase,
    phaseLabel: phaseLabels[village.phase] || village.phase,
    phaseMessage: getPublicPhaseMessage(village),
    nightAction: getPrivateNightAction(village, player),
  };
}

function emitPrivatePlayerState(village, player) {
  if (!player.socketId || !player.role) {
    return;
  }

  const privateState = getPrivatePlayerState(village, player.participantId);

  if (!privateState) {
    return;
  }

  io.to(player.socketId).emit('player:private-state', privateState);
}

function emitPrivatePlayerStates(village) {
  village.players.forEach((player) => {
    emitPrivatePlayerState(village, player);
  });
}

function emitVillagesList() {
  io.emit('villages:list', getPublicVillagesList());
}

function emitVillageState(villageCode) {
  const village = villages.get(villageCode);

  if (!village) {
    return;
  }

  io.to(villageCode).emit('village:state', getPublicVillageState(village));
  emitVillagesList();
}

function findVillageByParticipant(participantId) {
  for (const village of villages.values()) {
    if (village.narrator.participantId === participantId) {
      return {
        village,
        role: 'narrator',
      };
    }

    const player = village.players.find((candidate) => candidate.participantId === participantId);

    if (player) {
      return {
        village,
        role: 'player',
        player,
      };
    }
  }

  return null;
}

function registerParticipantSocket(socket, participantId) {
  const cleanParticipantId = normalizeParticipantId(participantId);

  if (!cleanParticipantId) {
    return null;
  }

  const previousSocketId = activeParticipantSockets.get(cleanParticipantId);

  if (previousSocketId && previousSocketId !== socket.id) {
    const previousSocket = io.sockets.sockets.get(previousSocketId);

    if (previousSocket) {
      previousSocket.emit('session:taken-over', {
        message: 'Se ha abierto otra conexión con esta misma sesión. Esta pestaña dejará de controlar el pueblo.',
      });

      previousSocket.disconnect(true);
    }
  }

  activeParticipantSockets.set(cleanParticipantId, socket.id);
  socket.data.participantId = cleanParticipantId;

  return cleanParticipantId;
}

function restoreParticipantConnection(socket, participantId) {
  const existingSession = findVillageByParticipant(participantId);

  if (!existingSession) {
    socket.emit('session:empty');
    socket.emit('villages:list', getPublicVillagesList());
    return;
  }

  const { village, role, player } = existingSession;

  if (role === 'narrator') {
    village.narrator.socketId = socket.id;
    village.narrator.connected = true;
  }

  if (role === 'player' && player) {
    player.socketId = socket.id;
    player.connected = true;
  }

  socket.join(village.code);

  socket.emit('session:restored', {
    role,
    village: getPublicVillageState(village),
  });

  if (role === 'player' && player && village.status === 'live') {
    emitPrivatePlayerState(village, player);
  }

  emitVillageState(village.code);
}

function markParticipantDisconnected(socket) {
  const participantId = socket.data.participantId;

  if (!participantId) {
    return;
  }

  const activeSocketId = activeParticipantSockets.get(participantId);

  if (activeSocketId !== socket.id) {
    return;
  }

  activeParticipantSockets.delete(participantId);

  const existingSession = findVillageByParticipant(participantId);

  if (!existingSession) {
    return;
  }

  const { village, role, player } = existingSession;

  if (role === 'narrator') {
    village.narrator.connected = false;
  }

  if (role === 'player' && player) {
    player.connected = false;
  }

  emitVillageState(village.code);
}

// Serve static frontend files from the public folder
app.use(express.static(PUBLIC_DIR));

// Simple health check route for local testing and deployment platforms
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'metricas-clasificacion',
    activeVillages: villages.size,
  });
});

// SPA fallback for clean internal routes
appRoutes.forEach((route) => {
  app.get(route, (req, res) => {
    res.sendFile(INDEX_FILE);
  });
});

function emitNarratorNightSummary(village) {
  const socketId = village.narrator.socketId;

  if (!socketId || village.narrator.connected === false) {
    return;
  }

  io.to(socketId).emit('narrator:night-summary', village.pendingNightResult || null);
}

function applyPendingNightResult(village) {
  const casualtyIds = new Set(
    (village.pendingNightResult?.casualties || []).map((casualty) => casualty.participantId)
  );

  village.players = village.players.map((player) => {
    if (!casualtyIds.has(player.participantId)) {
      return player;
    }

    return {
      ...player,
      alive: false,
      eliminationReason: 'killedByKillers',
    };
  });

  village.publicNightResult = village.pendingNightResult;
}

function resetVillageToLobby(village) {
  village.status = 'waiting';
  village.phase = 'lobby';
  village.nightActions = {};
  village.pendingNightResult = null;
  village.publicNightResult = null;
  village.votes = {};
  village.lastVotingResult = null;
  village.currentRound = 1;

  village.players = village.players.map((player) => ({
    ...player,
    role: null,
    alive: true,
      eliminationReason: null,
  }));
}


io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.emit('server:welcome', {
    message: 'Conectado al servidor de Métricas de Clasificación.',
  });

  socket.emit('villages:list', getPublicVillagesList());

  socket.on('session:restore', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);

    if (!cleanParticipantId) {
      socket.emit('session:empty');
      return;
    }

    restoreParticipantConnection(socket, cleanParticipantId);
  });

  socket.on('villages:list:request', () => {
    socket.emit('villages:list', getPublicVillagesList());
  });

  socket.on('village:create', ({ participantId, narratorName, villageName } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const cleanNarratorName = normalizeName(narratorName);
    const cleanVillageName = normalizeVillageName(villageName);

    if (!cleanParticipantId) {
      socket.emit('village:error', {
        message: 'No se ha podido identificar esta sesión. Recarga la página e inténtalo de nuevo.',
      });
      return;
    }

    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (existingSession) {
      socket.join(existingSession.village.code);

      socket.emit('session:restored', {
        role: existingSession.role,
        village: getPublicVillageState(existingSession.village),
      });

      socket.emit('village:error', {
        message: 'Este navegador ya está dentro de un pueblo. No puedes ser narrador y jugador a la vez.',
      });

      return;
    }

    if (!cleanNarratorName) {
      socket.emit('village:error', {
        message: 'Escribe tu nombre para crear el pueblo.',
      });
      return;
    }

    if (!cleanVillageName) {
      socket.emit('village:error', {
        message: 'Escribe un nombre para el pueblo.',
      });
      return;
    }

    const code = generateVillageCode();
    const village = {
      code,
      name: cleanVillageName,
      status: 'waiting',
      phase: 'lobby',
      phaseTimer: null,
      nightActions: {},
      pendingNightResult: null,
      publicNightResult: null,
      votes: {},
      lastVotingResult: null,
      votingRound: 1,
      runoffTargetIds: null,
      votingHistory: [],
      classificationEvents: [],
      finalReport: null,
      finalClassificationSummary: null,
      lastCompletedGameReport: null,
      lastCompletedClassificationSummary: null,
      currentRound: 1,
      narrator: {
        participantId: cleanParticipantId,
        socketId: socket.id,
        name: cleanNarratorName,
        connected: true,
      },
      players: [],
      settings: { ...defaultSettings },
      createdAt: Date.now(),
    };

    villages.set(code, village);
    socket.join(code);

    socket.emit('village:created', getPublicVillageState(village));
    emitVillageState(code);

    console.log(`Village created: ${code} (${cleanVillageName}) by ${cleanNarratorName}`);
  });

  socket.on('village:join', ({ participantId, playerName, villageCode } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const cleanPlayerName = normalizeName(playerName);
    const cleanVillageCode = normalizeVillageCode(villageCode);
    const village = villages.get(cleanVillageCode);

    if (!cleanParticipantId) {
      socket.emit('village:error', {
        message: 'No se ha podido identificar esta sesión. Recarga la página e inténtalo de nuevo.',
      });
      return;
    }

    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (existingSession) {
      socket.join(existingSession.village.code);

      socket.emit('session:restored', {
        role: existingSession.role,
        village: getPublicVillageState(existingSession.village),
      });

      socket.emit('village:error', {
        message: 'Este navegador ya está dentro de un pueblo. No puedes unirte dos veces ni usar dos roles a la vez.',
      });

      return;
    }

    if (!cleanPlayerName) {
      socket.emit('village:error', {
        message: 'Escribe tu nombre para unirte al pueblo.',
      });
      return;
    }

    if (!village) {
      socket.emit('village:error', {
        message: 'No existe ningún pueblo con ese código.',
      });
      return;
    }

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'Esta partida ya ha comenzado. No es posible unirse ahora.',
      });
      return;
    }

    village.players.push({
      participantId: cleanParticipantId,
      socketId: socket.id,
      name: cleanPlayerName,
      connected: true,
      role: null,
      alive: true,
      eliminationReason: null,
    });

    socket.join(cleanVillageCode);

    socket.emit('village:joined', getPublicVillageState(village));
    emitVillageState(cleanVillageCode);

    console.log(`${cleanPlayerName} joined village: ${cleanVillageCode}`);
  });

  socket.on('village:complete', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede marcar el pueblo como completo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'La partida ya ha comenzado.',
      });
      return;
    }

    if (village.players.length < 3) {
      socket.emit('village:error', {
        message: 'Debe haber al menos 3 jugadores antes de cerrar el pueblo.',
      });
      return;
    }

    village.status = 'setup';
    village.settings.killersCount = Math.min(
      village.settings.killersCount,
      getMaxKillersCount(village.players.length)
    );

    io.to(village.code).emit('village:completed', getPublicVillageState(village));
    emitVillageState(village.code);

    console.log(`Village completed: ${village.code}`);
  });

  socket.on('village:reopen', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede reabrir el pueblo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'No se puede reabrir el pueblo cuando la partida ya ha comenzado.',
      });
      return;
    }

    if (village.status === 'waiting') {
      socket.emit('village:error', {
        message: 'El pueblo ya está abierto esperando jugadores.',
      });
      return;
    }

    village.status = 'waiting';
    village.phase = 'lobby';
    village.phaseTimer = null;
    village.nightActions = {};
    village.pendingNightResult = null;
    village.publicNightResult = null;
    village.votes = {};
    village.lastVotingResult = null;
    village.votingRound = 1;
    village.runoffTargetIds = null;
    village.votingHistory = [];
    village.lastVotingResult = null;
    village.votingRound = 1;
    village.runoffTargetIds = null;
    village.classificationEvents = [];
    village.lastVotingResult = null;
    village.votingRound = 1;
    village.runoffTargetIds = null;
    clearPlayerRoles(village);

    io.to(village.code).emit('village:reopened', getPublicVillageState(village));
    emitVillageState(village.code);

    console.log(`Village reopened: ${village.code}`);
  });

  socket.on('village:delete', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede eliminar el pueblo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status === 'live') {
      socket.emit('village:error', {
        message: 'No se puede eliminar el pueblo cuando la partida ya ha comenzado.',
      });
      return;
    }

    io.to(village.code).emit('village:deleted', {
      message: 'El narrador ha eliminado el pueblo. Vuelve a la pantalla inicial para elegir de nuevo.',
    });

    villages.delete(village.code);
    emitVillagesList();

    console.log(`Village deleted: ${village.code}`);
  });

  socket.on('village:leave', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'player') {
      socket.emit('village:error', {
        message: 'No estás unido a ningún pueblo como jugador.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'waiting') {
      socket.emit('village:error', {
        message: 'Ya no puedes salir del pueblo porque el narrador lo ha marcado como completo.',
      });
      return;
    }

    village.players = village.players.filter((player) => player.participantId !== cleanParticipantId);
    socket.leave(village.code);

    socket.emit('village:left', {
      message: 'Has salido del pueblo. Puedes unirte a otro o crear una nueva sesión.',
    });

    emitVillageState(village.code);

    console.log(`Participant left village: ${village.code}`);
  });

  socket.on('village:settings:update', ({ participantId, settings } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede editar la configuración del pueblo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'setup') {
      socket.emit('village:error', {
        message: 'Primero marca el pueblo como completo antes de configurar la partida.',
      });
      return;
    }

    const normalizedSettings = normalizeSettings(settings);
    const validationError = validatePlayableSettings(village, normalizedSettings);

    if (validationError) {
      socket.emit('village:error', {
        message: validationError,
      });
      return;
    }

    village.settings = normalizedSettings;

    socket.emit('village:settings:saved', getPublicVillageState(village));
    emitVillageState(village.code);

    console.log(`Village settings updated: ${village.code}`);
  });

  socket.on('village:start', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede comenzar la partida.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'setup') {
      socket.emit('village:error', {
        message: 'Primero marca el pueblo como completo y guarda la configuración.',
      });
      return;
    }

    const validationError = validatePlayableSettings(village, village.settings);

    if (validationError) {
      socket.emit('village:error', {
        message: validationError,
      });
      return;
    }

    assignRolesToPlayers(village);
    village.status = 'live';
    village.phase = 'roleReveal';
    village.phaseTimer = null;
    village.nightActions = {};
    village.pendingNightResult = null;
    village.publicNightResult = null;
    village.votes = {};
    village.lastVotingResult = null;
    village.votingRound = 1;
    village.runoffTargetIds = null;
    village.currentRound = 1;

    io.to(village.code).emit('village:started', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Village started: ${village.code}`);
  });

  socket.on('phase:start-night', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede comenzar la noche.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live') {
      socket.emit('village:error', {
        message: 'La partida todavía no ha comenzado.',
      });
      return;
    }

    if (village.phase !== 'roleReveal') {
      socket.emit('village:error', {
        message: 'La noche solo puede comenzar después de la revelación de roles.',
      });
      return;
    }

    village.phase = 'night';
    village.phaseTimer = null;
    village.nightActions = {};
    village.pendingNightResult = null;
    village.publicNightResult = null;

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Night started: ${village.code}`);
  });

  socket.on('phase:end-night', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede cerrar la noche.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live' || village.phase !== 'night') {
      socket.emit('village:error', {
        message: 'Ahora mismo no estamos en fase de noche.',
      });
      return;
    }

    village.pendingNightResult = buildNightResult(village);
    village.phase = 'nightClosed';
    village.phaseTimer = null;

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);
    emitNarratorNightSummary(village);

    console.log(`Night closed: ${village.code}`);
  });

  socket.on('phase:wake-village', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede levantar al pueblo.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live' || village.phase !== 'nightClosed') {
      socket.emit('village:error', {
        message: 'Primero debes cerrar la noche.',
      });
      return;
    }

    applyPendingNightResult(village);

    const victoryState = finishVillageIfVictory(village);

    if (!victoryState.finished) {
      village.phase = 'day';
    }

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Village woke up: ${village.code}`);
  });

  socket.on('phase:start-discussion', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede iniciar la discusión.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live' || village.phase !== 'day') {
      socket.emit('village:error', {
        message: 'Primero el pueblo debe levantarse.',
      });
      return;
    }

    village.phase = 'discussion';
    village.phaseTimer = createPhaseTimer(
      'discussion',
      village.settings?.discussionTimeSeconds || defaultSettings.discussionTimeSeconds
    );

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Discussion started: ${village.code}`);
  });

  socket.on('phase:start-voting', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede iniciar la votación.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live' || village.phase !== 'discussion') {
      socket.emit('village:error', {
        message: 'Primero debe estar activa la fase de discusión.',
      });
      return;
    }

    village.phase = 'voting';
    village.phaseTimer = createPhaseTimer(
      'voting',
      village.settings?.votingTimeSeconds || defaultSettings.votingTimeSeconds
    );
    village.votes = {};
    village.lastVotingResult = null;
    village.votingRound = 1;
    village.runoffTargetIds = null;

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Voting started: ${village.code}`);
  });

  socket.on('vote:cast', ({ participantId, targetId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'player' || !existingSession.player) {
      socket.emit('village:error', {
        message: 'Solo un jugador puede votar.',
      });
      return;
    }

    const { village, player } = existingSession;

    if (village.status !== 'live' || village.phase !== 'voting') {
      socket.emit('village:error', {
        message: 'Ahora mismo no estamos en fase de votación.',
      });
      return;
    }

    if (player.alive === false) {
      socket.emit('village:error', {
        message: 'Los jugadores eliminados no pueden votar.',
      });
      return;
    }

    const candidates = getVotingCandidates(village);
    const candidateIds = new Set(candidates.map((candidate) => candidate.participantId));
    const isRunoff = village.votingRound === 2;

    if (targetId === NO_VOTE_TARGET) {
      village.votes[player.participantId] = NO_VOTE_TARGET;

      emitVillageState(village.code);

      socket.emit('vote:cast:confirmed', {
        targetName: 'No votar a nadie',
      });

      console.log(`Vote received in village: ${village.code}`);
      return;
    }

    if (!candidateIds.has(targetId)) {
      socket.emit('village:error', {
        message: isRunoff
          ? 'En la segunda votación solo puedes votar entre las personas empatadas.'
          : 'Solo puedes votar a jugadores vivos.',
      });
      return;
    }

    const target = village.players.find((candidate) => candidate.participantId === targetId);

    if (!target || target.alive === false) {
      socket.emit('village:error', {
        message: 'Solo puedes votar a jugadores vivos.',
      });
      return;
    }

    if (target.participantId === player.participantId) {
      socket.emit('village:error', {
        message: 'No puedes votarte a ti mismo.',
      });
      return;
    }

    village.votes[player.participantId] = target.participantId;

    emitVillageState(village.code);

    socket.emit('vote:cast:confirmed', {
      targetName: target.name,
    });

    console.log(`Vote received in village: ${village.code}`);
  });

  socket.on('phase:end-voting', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede cerrar la votación.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live' || village.phase !== 'voting') {
      socket.emit('village:error', {
        message: 'Ahora mismo no estamos en fase de votación.',
      });
      return;
    }

    village.phaseTimer = null;

    const votingResult = buildVotingResult(village);
    village.lastVotingResult = votingResult;
    appendVotingHistory(village, votingResult);
    applyVotingResult(village, votingResult);

    const victoryState = finishVillageIfVictory(village);

    if (!victoryState.finished) {
      village.phase = 'votingClosed';
    }

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Voting closed: ${village.code}`);
  });


  socket.on('phase:start-runoff-voting', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede iniciar la segunda votación.',
      });
      return;
    }

    const { village } = existingSession;

    if (
      village.status !== 'live' ||
      village.phase !== 'votingClosed' ||
      !village.lastVotingResult?.requiresRunoff
    ) {
      socket.emit('village:error', {
        message: 'Ahora mismo no hay un empate pendiente de desempate.',
      });
      return;
    }

    village.votingRound = 2;
    village.runoffTargetIds = village.lastVotingResult.runoffTargetIds || [];
    village.votes = {};
    village.lastVotingResult = null;
    village.phase = 'voting';
    village.phaseTimer = createPhaseTimer(
      'voting',
      village.settings?.votingTimeSeconds || defaultSettings.votingTimeSeconds
    );

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Runoff voting started: ${village.code}`);
  });


  socket.on('phase:next-round', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede pasar a la siguiente ronda.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live' || village.phase !== 'votingClosed') {
      socket.emit('village:error', {
        message: 'Solo se puede pasar de ronda después de cerrar la votación.',
      });
      return;
    }

    const totalRounds = village.settings?.roundsCount || 1;
    const currentRound = village.currentRound || 1;

    if (currentRound >= totalRounds) {
      socket.emit('village:error', {
        message: 'No quedan más rondas. Revisa los resultados finales.',
      });
      return;
    }

    village.currentRound = currentRound + 1;
    clearRoundState(village);
    village.phase = 'night';

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Next round started: ${village.code} (${village.currentRound}/${totalRounds})`);
  });

  socket.on('phase:show-final-results', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede mostrar los resultados finales.',
      });
      return;
    }

    const { village } = existingSession;

    if (village.status !== 'live' || village.phase !== 'votingClosed') {
      socket.emit('village:error', {
        message: 'Solo se pueden mostrar resultados finales después de cerrar la votación.',
      });
      return;
    }

    storeFinalReport(village, getVictoryState(village));
    village.phase = 'finalResults';
    village.phaseTimer = null;

    io.to(village.code).emit('phase:changed', getPublicVillageState(village));
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Final results shown: ${village.code}`);
  });

  socket.on('game:end', ({ participantId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'narrator') {
      socket.emit('village:error', {
        message: 'Solo el narrador puede acabar la partida.',
      });
      return;
    }

    const { village } = existingSession;

    resetVillageToLobby(village);
    emitVillageState(village.code);
    emitPrivatePlayerStates(village);

    console.log(`Game ended and lobby reopened: ${village.code}`);
  });

  socket.on('night:choose-victim', ({ participantId, targetId } = {}) => {
    const cleanParticipantId = registerParticipantSocket(socket, participantId);
    const existingSession = findVillageByParticipant(cleanParticipantId);

    if (!existingSession || existingSession.role !== 'player' || !existingSession.player) {
      socket.emit('village:error', {
        message: 'Solo un jugador puede realizar una acción nocturna.',
      });
      return;
    }

    const { village, player } = existingSession;

    if (village.status !== 'live' || village.phase !== 'night') {
      socket.emit('village:error', {
        message: 'Ahora mismo no estamos en fase de noche.',
      });
      return;
    }

    if (player.role !== 'killer') {
      socket.emit('village:error', {
        message: 'Los vecinos no tienen acción durante la noche.',
      });
      return;
    }

    if (targetId === NO_KILL_TARGET) {
      village.nightActions[player.participantId] = NO_KILL_TARGET;

      emitPrivatePlayerStates(village);
      emitVillageState(village.code);

      console.log(`Night action received in village: ${village.code}`);
      return;
    }

    const target = village.players.find((candidate) => candidate.participantId === targetId);

    if (!target || target.participantId === player.participantId || target.alive === false || target.role === 'killer') {
      socket.emit('village:error', {
        message: 'Objetivo nocturno no válido. Los asesinos solo pueden atacar a vecinos.',
      });
      return;
    }

    village.nightActions[player.participantId] = target.participantId;

    emitPrivatePlayerStates(village);
    emitVillageState(village.code);

    console.log(`Night action received in village: ${village.code}`);
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    markParticipantDisconnected(socket);
  });
});

server.listen(PORT, HOST, () => {
  const localUrl = `http://localhost:${PORT}`;
  const networkUrl = `http://${HOST}:${PORT}`;

  console.log(`Server running on ${localUrl}`);
  console.log(`Network binding: ${networkUrl}`);
});
