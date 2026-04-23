#![no_std]

//! # Stellar-Save Smart Contract
//! 
//! A decentralized rotational savings and credit association (ROSCA) built on Stellar Soroban.
//! 
//! This contract enables groups to pool funds in a rotating savings system where:
//! - Members contribute a fixed amount each cycle
//! - One member receives the total pool each cycle
//! - The process rotates until all members have received a payout
//! 
//! ## Modules
//! - `error`: Comprehensive error types and handling
//! - `group`: Core Group data structure and state management
//! - `contribution`: Contribution record tracking for member payments
//! - `payout`: Payout record tracking for fund distributions

pub mod error;
pub mod contribution;
pub mod group;
pub mod payout;

// Re-export for convenience
pub use error::{StellarSaveError, ErrorCategory, ContractResult};
pub use group::{Group, GroupStatus};
pub use contribution::ContributionRecord;
pub use payout::PayoutRecord;
use soroban_sdk::{contract, contractimpl, Env, Address, Map, symbol_short};

#[contract]
pub struct StellarSaveContract;

#[contractimpl]
impl StellarSaveContract {
    pub fn hello(_env: Env) -> soroban_sdk::Symbol {
        soroban_sdk::symbol_short!("hello")
    }

    /// Resets the rate limit for a specific address.
    /// Only callable by the admin.
    pub fn reset_rate_limit(env: Env, admin: Address, address: Address) {
        admin.require_auth();

        // TODO: Add proper admin check
        // For now, allow any authenticated caller

        let mut rate_limits: Map<Address, u64> = env.storage().persistent().get(&symbol_short!("ratelimit")).unwrap_or(Map::new(&env));
        rate_limits.set(address.clone(), 0);
        env.storage().persistent().set(&symbol_short!("ratelimit"), &rate_limits);

        // Emit event
        env.events().publish((symbol_short!("ResetRL"),), address);
    }

    /// Check if address can contribute (rate limit check)
    pub fn can_contribute(env: Env, address: Address) -> bool {
        let rate_limits: Map<Address, u64> = env.storage().persistent().get(&symbol_short!("ratelimit")).unwrap_or(Map::new(&env));
        let last_contribution = rate_limits.get(address).unwrap_or(0);
        let current_time = env.ledger().timestamp();
        let min_interval: u64 = 3600; // 1 hour in seconds

        current_time >= last_contribution + min_interval
    }

    /// Record a contribution (update rate limit)
    pub fn record_contribution(env: Env, address: Address) {
        let mut rate_limits: Map<Address, u64> = env.storage().persistent().get(&symbol_short!("ratelimit")).unwrap_or(Map::new(&env));
        rate_limits.set(address, env.ledger().timestamp());
        env.storage().persistent().set(&symbol_short!("ratelimit"), &rate_limits);
    }
}
