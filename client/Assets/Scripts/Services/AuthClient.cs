using System.Threading.Tasks;

namespace Siegebreak.Services
{
    /// <summary>Thin HTTP client for the backend `auth` module.</summary>
    public class AuthClient
    {
        public Task<bool> LoginGuest() => throw new System.NotImplementedException();
        public Task<bool> LoginApple(string identityToken) => throw new System.NotImplementedException();
        public Task<bool> LoginGoogle(string idToken) => throw new System.NotImplementedException();
    }
}
