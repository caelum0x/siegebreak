using Siegebreak.Cards;

namespace Siegebreak.Units
{
    /// <summary>
    /// Identity tag attached to every troop/building GameObject the moment
    /// it's spawned (host: Core/MatchHostSimulator on a validated deploy;
    /// guest: Core/MatchSimulationController when a new unitId first shows
    /// up in a state_snapshot). Carries exactly what both sides need to
    /// agree an instance is "the same unit": a server-assigned id, which
    /// card it came from (for stats + targeting rules), and whose side it's
    /// on. Not a MonoBehaviour-with-logic on purpose — AutoUnitAI stays the
    /// only thing driving movement/attack state so the guest can disable
    /// just that component and keep this one as pure data.
    /// </summary>
    public class SpawnedUnit : UnityEngine.MonoBehaviour
    {
        public string UnitId { get; private set; }
        public CardData Card { get; private set; }
        public bool IsHostOwned { get; private set; }

        public AutoUnitAI Ai { get; private set; }
        public UnitHealth Health { get; private set; }

        public void Initialize(string unitId, CardData card, bool isHostOwned)
        {
            UnitId = unitId;
            Card = card;
            IsHostOwned = isHostOwned;

            Ai = GetComponent<AutoUnitAI>();
            Health = GetComponent<UnitHealth>();
            if (Health == null) Health = gameObject.AddComponent<UnitHealth>();
            Health.Initialize(card != null ? card.hp : 1);
        }
    }
}
