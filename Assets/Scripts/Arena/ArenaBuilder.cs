using System.Collections.Generic;
using UnityEngine;

namespace FPClash
{
    public struct TowerSpot
    {
        public TowerKind kind;
        public Team team;
        public Vector3 pos;
    }

    /// <summary>
    /// Procedurally builds the Clash-style vertical arena: a flat field split by
    /// a river, perimeter walls, and the six tower positions. Also hands out
    /// spawn points for each team.
    /// </summary>
    public class ArenaBuilder : MonoBehaviour
    {
        public const float HalfWidth = 15f;   // X extent (±)
        public const float HalfLength = 28f;  // Z extent (±). Blue = -Z, Red = +Z.

        public readonly List<TowerSpot> Towers = new List<TowerSpot>();

        public void Build()
        {
            BuildGround();
            BuildWalls();
            BuildRiver();
            BuildTowerSpots();
        }

        void BuildGround()
        {
            // Two-tone halves so each side reads as its own territory.
            var blueHalf = Prims.Box("Ground_Blue", transform,
                new Vector3(0f, -0.5f, -HalfLength * 0.5f),
                new Vector3(HalfWidth * 2f, 1f, HalfLength), new Color(0.30f, 0.42f, 0.30f));
            var redHalf = Prims.Box("Ground_Red", transform,
                new Vector3(0f, -0.5f, HalfLength * 0.5f),
                new Vector3(HalfWidth * 2f, 1f, HalfLength), new Color(0.42f, 0.34f, 0.30f));
            // keep colliders on both for the CharacterController to stand on
        }

        void BuildWalls()
        {
            const float h = 3f;
            const float t = 1f;
            Color c = new Color(0.15f, 0.15f, 0.18f);
            Prims.Box("Wall_N", transform, new Vector3(0f, h * 0.5f, HalfLength + t * 0.5f),
                new Vector3(HalfWidth * 2f + t * 2f, h, t), c);
            Prims.Box("Wall_S", transform, new Vector3(0f, h * 0.5f, -HalfLength - t * 0.5f),
                new Vector3(HalfWidth * 2f + t * 2f, h, t), c);
            Prims.Box("Wall_E", transform, new Vector3(HalfWidth + t * 0.5f, h * 0.5f, 0f),
                new Vector3(t, h, HalfLength * 2f), c);
            Prims.Box("Wall_W", transform, new Vector3(-HalfWidth - t * 0.5f, h * 0.5f, 0f),
                new Vector3(t, h, HalfLength * 2f), c);
        }

        void BuildRiver()
        {
            var river = Prims.Box("River", transform, new Vector3(0f, 0.02f, 0f),
                new Vector3(HalfWidth * 2f, 0.04f, 3.5f), new Color(0.25f, 0.5f, 0.85f), false);
            river.GetComponent<MeshRenderer>().sharedMaterial =
                Prims.EmissiveMat(new Color(0.2f, 0.45f, 0.8f));
        }

        void BuildTowerSpots()
        {
            Towers.Clear();
            AddTeamTowers(Team.Blue, -1f);
            AddTeamTowers(Team.Red, +1f);
        }

        void AddTeamTowers(Team team, float dir)
        {
            float kingZ = dir * (HalfLength - 4f);
            float princessZ = dir * (HalfLength - 11f);
            Towers.Add(new TowerSpot { kind = TowerKind.King, team = team, pos = new Vector3(0f, 0f, kingZ) });
            Towers.Add(new TowerSpot { kind = TowerKind.Princess, team = team, pos = new Vector3(-9f, 0f, princessZ) });
            Towers.Add(new TowerSpot { kind = TowerKind.Princess, team = team, pos = new Vector3(9f, 0f, princessZ) });
        }

        public Vector3 KingPos(Team team) =>
            new Vector3(0f, 0f, (team == Team.Blue ? -1f : 1f) * (HalfLength - 4f));

        /// <summary>Centre of a team's spawn area (just in front of its king).</summary>
        public Vector3 SpawnCenter(Team team) =>
            new Vector3(0f, 0f, (team == Team.Blue ? -1f : 1f) * (HalfLength - 8f));

        /// <summary>A scattered spawn position for a unit, already facing the enemy side.</summary>
        public void RandomSpawn(Team team, int index, out Vector3 pos, out Quaternion rot)
        {
            Vector3 c = SpawnCenter(team);
            float x = Mathf.Lerp(-8f, 8f, (index % 5) / 4f) + Random.Range(-1.2f, 1.2f);
            float z = c.z + Random.Range(-2.5f, 2.5f);
            pos = new Vector3(x, 0.1f, z);
            Vector3 face = (new Vector3(0f, 0f, team == Team.Blue ? 1f : -1f));
            rot = Quaternion.LookRotation(face, Vector3.up);
        }
    }
}
