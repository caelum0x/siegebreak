namespace FPClash
{
    /// <summary>Which side a unit / tower belongs to.</summary>
    public enum Team
    {
        Blue = 0, // the player's team
        Red = 1   // the enemy team
    }

    public static class TeamUtil
    {
        public static Team Opponent(this Team t) => t == Team.Blue ? Team.Red : Team.Blue;

        public static UnityEngine.Color Color(this Team t) =>
            t == Team.Blue
                ? new UnityEngine.Color(0.25f, 0.55f, 1f)
                : new UnityEngine.Color(1f, 0.35f, 0.3f);
    }
}
