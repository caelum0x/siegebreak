using System;

namespace Siegebreak.Services
{
    // Serializable data-transfer objects mirroring the backend contract
    // (services/). Fields are public and named to match the JSON exactly so
    // Unity's JsonUtility can (de)serialize them directly.

    [Serializable]
    public class AuthTokens
    {
        public string accessToken;
        public string refreshToken;
    }

    [Serializable]
    public class GuestLoginRequest
    {
        public string deviceId;
    }

    [Serializable]
    public class AppleLoginRequest
    {
        public string identityToken;
    }

    [Serializable]
    public class GoogleLoginRequest
    {
        public string idToken;
    }

    [Serializable]
    public class RefreshRequest
    {
        public string refreshToken;
    }

    [Serializable]
    public class QueueRequest
    {
        public string deckId;
    }

    [Serializable]
    public class StatusResponse
    {
        public string status;
    }

    /// <summary>Matchmaking ticket as returned by GET /matchmaking/status.</summary>
    [Serializable]
    public class MatchTicket
    {
        public string status;    // "queued" | "matched" (empty when no ticket)
        public string sessionId; // present once matched
        public string deckId;
        public string queuedAt;

        public bool IsMatched => status == "matched" && !string.IsNullOrEmpty(sessionId);
    }

    [Serializable]
    public class SessionParticipant
    {
        public string playerId;
        public string deckId;
    }

    [Serializable]
    public class SessionConnection
    {
        public string provider; // "local" | "photon"
        public string roomName;
    }

    /// <summary>Allocated realtime room from GET /matches/session/:id.</summary>
    [Serializable]
    public class GameSession
    {
        public string id;
        public string mode;
        public string region;
        public string status;
        public long createdAt;
        public SessionParticipant[] participants;
        public SessionConnection connection;
    }

    [Serializable]
    public class WalletDto
    {
        public int gold;
        public int gems;
    }

    [Serializable]
    public class Wallet
    {
        public string playerId;
        public int gold;
        public int gems;
    }

    [Serializable]
    public class PlayerRecord
    {
        public int wins;
        public int losses;
        public int draws;
        public int played;
        public float winRate;
    }

    /// <summary>Authenticated progression from GET /players/me.</summary>
    [Serializable]
    public class PlayerProfile
    {
        public string id;
        public string displayName;
        public int level;
        public int xp;
        public int rating;
        public WalletDto wallet;
        public PlayerRecord record;
    }

    [Serializable]
    public class MatchOpponent
    {
        public string playerId;
        public string displayName;
        public string result;
    }

    [Serializable]
    public class MatchHistoryEntry
    {
        public string matchId;
        public string mode;
        public string region;
        public string endedAt;
        public string result;
        public int trophiesDelta;
        public string deckId;
        public MatchOpponent[] opponents;
    }

    [Serializable]
    public class Product
    {
        public string productId;
        public int gems;
    }

    [Serializable]
    public class PurchaseRequest
    {
        public string platform; // "ios" | "android"
        public string receipt;
    }

    [Serializable]
    public class PurchaseResult
    {
        public string status; // "granted"
        public string productId;
        public int gemsGranted;
    }

    /// <summary>Realtime match-found frame from WS /matchmaking/subscribe.</summary>
    [Serializable]
    public class MatchSocketMessage
    {
        public string type; // "matched" | "error"
        public string sessionId;
        public string error;
    }
}
