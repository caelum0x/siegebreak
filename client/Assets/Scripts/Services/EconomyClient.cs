using System.Threading.Tasks;

namespace Siegebreak.Services
{
    /// <summary>
    /// HTTP client for the backend `economy` module: the store catalog, the
    /// player's wallet, and purchase validation. Gems are granted server-side
    /// from the verified receipt, so the client only forwards the store receipt
    /// and reflects the result.
    /// </summary>
    public class EconomyClient
    {
        public async Task<Product[]> GetProducts()
        {
            var res = await HttpApi.GetArrayAsync<Product>("/economy/products", auth: false);
            return res.Success ? res.Data : System.Array.Empty<Product>();
        }

        public async Task<Wallet> GetWallet()
        {
            var res = await HttpApi.GetAsync<Wallet>("/economy/wallet", auth: true);
            return res.Success ? res.Data : null;
        }

        /// <summary>
        /// Submit a store receipt for verification. Returns the grant result on
        /// success, or null if the receipt was rejected/failed verification —
        /// callers must not credit anything themselves; the server is
        /// authoritative.
        /// </summary>
        public async Task<PurchaseResult> ValidatePurchase(string platform, string receipt)
        {
            string body = HttpApi.JsonUtilityBody(
                new PurchaseRequest { platform = platform, receipt = receipt });
            var res = await HttpApi.PostAsync<PurchaseResult>(
                "/economy/purchase/validate", body, auth: true);
            return res.Success ? res.Data : null;
        }
    }
}
