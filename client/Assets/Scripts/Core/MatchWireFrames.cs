using System;
using System.Collections.Generic;
using UnityEngine;

namespace Siegebreak.Core
{
    /// <summary>
    /// Gameplay frame payloads carried over NetworkBootstrap's transport
    /// once a match is live. These are parsed/built here (Core) separately
    /// from Cards/CardDeploymentManager's own DeployInputFrame — same wire
    /// shape, different namespace, because JsonUtility matches on field
    /// names, not C# type identity, and the host simulator (which lives in
    /// Core) needs to read a deploy_input frame it didn't create without a
    /// circular Core-&gt;Cards-&gt;Core dependency.
    /// </summary>
    [Serializable]
    internal class WireFrameEnvelope
    {
        public string type;
    }

    [Serializable]
    internal class DeployInputWireFrame
    {
        public string type;
        public string cardId;
        public float x;
        public float y;
        public float z;
        public float clientTimeSeconds;
    }

    /// <summary>
    /// Host -> guest only. Sent on a fixed cadence (see
    /// MatchHostSimulator.SnapshotIntervalSeconds) carrying the full
    /// authoritative state the guest needs to render: every live unit,
    /// every tower's HP, both players' elixir, and the match result.
    /// Deliberately a full snapshot rather than a diff — matches are short
    /// and unit counts are small, so the bandwidth cost of resending
    /// everything is worth not having to reason about dropped-delta
    /// desync on an unreliable relay hop.
    /// </summary>
    [Serializable]
    internal class StateSnapshotWireFrame
    {
        public string type = "state_snapshot";
        public List<UnitSnapshot> units = new List<UnitSnapshot>();
        public List<TowerSnapshot> towers = new List<TowerSnapshot>();
        public int hostElixir;
        public int guestElixir;
        public string matchResult;
        public float serverTimeSeconds;
    }

    [Serializable]
    internal class UnitSnapshot
    {
        public string unitId;
        public string cardId;
        public bool isHostOwned;
        public float x;
        public float y;
        public float z;
        public int currentHp;
    }

    [Serializable]
    internal class TowerSnapshot
    {
        public string towerId;
        public int currentHp;
    }

    /// <summary>
    /// Shared helpers so MatchHostSimulator and MatchSimulationController
    /// don't each reimplement the same try/catch-wrapped JsonUtility calls.
    /// </summary>
    internal static class MatchWireFrame
    {
        public static string TypeOf(string json)
        {
            try
            {
                var envelope = JsonUtility.FromJson<WireFrameEnvelope>(json);
                return envelope?.type;
            }
            catch (Exception)
            {
                return null;
            }
        }

        public static bool TryParseDeployInput(string json, out DeployInputWireFrame frame)
        {
            try
            {
                frame = JsonUtility.FromJson<DeployInputWireFrame>(json);
                return frame != null && !string.IsNullOrEmpty(frame.cardId);
            }
            catch (Exception)
            {
                frame = null;
                return false;
            }
        }

        public static bool TryParseStateSnapshot(string json, out StateSnapshotWireFrame frame)
        {
            try
            {
                frame = JsonUtility.FromJson<StateSnapshotWireFrame>(json);
                return frame != null;
            }
            catch (Exception)
            {
                frame = null;
                return false;
            }
        }
    }
}
