module fast_path_lottery::lottery {
    use sui::balance::{Self, Balance};
    use sui::transfer::Receiving;
    use sui::coin::{Self, Coin};
    use sui::table_vec::{Self, TableVec};

    use fast_path_lottery::drand_lib;
    use fud::fud::FUD;

    public struct Lottery has key {
        id :UID,
        balance: Balance<FUD>,
        participants: TableVec<SlotMachine>,
        total_count: u64,
        winner: Option<address>,
    }

    public struct SlotMachine has key, store {
        id: UID,
        owner: address,
        count: u64,
    }

    fun init(ctx: &mut TxContext) {
        transfer::share_object(Lottery {
            id: object::new(ctx),
            balance: balance::zero<FUD>(),
            participants: table_vec::empty(ctx),
            total_count: 0,
            winner: option::none(),
        })
    }

    // step 1: participant creates a single slot machine when arriving on the app
    public fun create_slot_machine(ctx: &mut TxContext): SlotMachine {
        SlotMachine { id: object::new(ctx), owner: ctx.sender(), count: 0 }
    }

    // step 2: [BREAK SUI OPENS] participants send as many fud coins as possible to their own SlotMachine 

    // step 3: [BREAK SUI CLOSES] participants can load the lottery with the coins in their SlotMachine 
    public fun process_coins(lottery: &mut Lottery, machine: &mut SlotMachine, mut to_receive: vector<Receiving<Coin<FUD>>>) {
        while (!to_receive.is_empty()) {
            let receiving = to_receive.pop_back();
            let received = transfer::public_receive(&mut machine.id, receiving);
            lottery.balance.join(received.into_balance());
            machine.count = machine.count + 1;
        }
    }

    // step 4: participants register by adding their SlotMachine to the lottery
    public fun register(lottery: &mut Lottery, machine: SlotMachine) {
        lottery.total_count = lottery.total_count + machine.count;
        lottery.participants.push_back(machine);
    }

    // step 5: anyone can draw the winner completely randomly
    public fun draw_winner(lottery: &mut Lottery, ctx: &mut TxContext) {
        assert!(lottery.winner.is_none(), 0);

        let id = object::new(ctx);
        let digest = drand_lib::derive_randomness(id.uid_to_bytes());
        id.delete();    
        let rand_number = drand_lib::safe_selection(lottery.total_count, &digest);

        let mut number = 0;
        let winner = loop {
            let SlotMachine { id, owner, count } = lottery.participants.pop_back();
            id.delete();    
            number = number + count;
            if (number > rand_number) { break owner }
        };

        lottery.winner.fill(winner);
    }

    // step 6: winner can claim the prize
    #[allow(lint(self_transfer))]
    public fun claim_prize(lottery: &mut Lottery, ctx: &mut TxContext) {
        assert!(lottery.winner.extract() == ctx.sender(), 1);
        let value = lottery.balance.value();
        transfer::public_transfer(
            coin::from_balance(lottery.balance.split<FUD>(value), ctx), 
            ctx.sender()
        );
    }
}
