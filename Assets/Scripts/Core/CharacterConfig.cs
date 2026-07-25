using System.Collections.Generic;
using UnityEngine;

namespace FPClash
{
    /// <summary>
    /// Plain data describing a playable/AI character. Kept as code (not a
    /// ScriptableObject asset) so the whole MVP is self-contained and needs
    /// no manual asset authoring in the editor.
    /// </summary>
    [System.Serializable]
    public class CharacterConfig
    {
        public string id;
        public string displayName;

        public float maxHealth = 800f;
        public float moveSpeed = 4.5f;
        public float attackDamage = 120f;
        public float attackRange = 2.4f;     // melee reach (world units)
        public float attackAngle = 120f;     // arc of the melee swing in degrees
        public float attackCooldown = 1.1f;  // seconds between swings
        public float attackWindup = 0.25f;   // delay before damage lands
        public float bodyHeight = 2.0f;
        public float bodyRadius = 0.55f;
        public Color bodyColor = new Color(0.8f, 0.8f, 0.85f);

        /// <summary>The roster available in the character select screen.</summary>
        public static readonly List<CharacterConfig> Roster = new List<CharacterConfig>
        {
            new CharacterConfig
            {
                id = "pekka", displayName = "P.E.K.K.A",
                maxHealth = 1400f, moveSpeed = 4.0f,
                attackDamage = 240f, attackRange = 2.6f, attackAngle = 100f,
                attackCooldown = 1.4f, attackWindup = 0.30f,
                bodyHeight = 2.4f, bodyRadius = 0.65f,
                bodyColor = new Color(0.30f, 0.30f, 0.45f)
            },
            new CharacterConfig
            {
                id = "knight", displayName = "Knight",
                maxHealth = 950f, moveSpeed = 4.8f,
                attackDamage = 130f, attackRange = 2.2f, attackAngle = 120f,
                attackCooldown = 1.0f, attackWindup = 0.22f,
                bodyHeight = 2.0f, bodyRadius = 0.55f,
                bodyColor = new Color(0.55f, 0.45f, 0.35f)
            },
            new CharacterConfig
            {
                id = "valkyrie", displayName = "Valkyrie",
                maxHealth = 900f, moveSpeed = 5.2f,
                attackDamage = 110f, attackRange = 2.4f, attackAngle = 360f, // spin: hits all around
                attackCooldown = 0.85f, attackWindup = 0.18f,
                bodyHeight = 1.9f, bodyRadius = 0.55f,
                bodyColor = new Color(0.75f, 0.35f, 0.35f)
            },
            new CharacterConfig
            {
                id = "goblin", displayName = "Goblin",
                maxHealth = 600f, moveSpeed = 6.5f,
                attackDamage = 80f, attackRange = 2.0f, attackAngle = 90f,
                attackCooldown = 0.6f, attackWindup = 0.12f,
                bodyHeight = 1.5f, bodyRadius = 0.45f,
                bodyColor = new Color(0.35f, 0.7f, 0.35f)
            },
        };

        public static CharacterConfig ById(string id)
        {
            foreach (var c in Roster)
                if (c.id == id) return c;
            return Roster[0];
        }

        /// <summary>A shallow copy so per-instance state never mutates the roster.</summary>
        public CharacterConfig Clone()
        {
            return (CharacterConfig)MemberwiseClone();
        }
    }
}
