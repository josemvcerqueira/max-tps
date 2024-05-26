module useless::useless {

  public struct Useless has key, store {
    id :UID
  }

  public fun new(ctx: &mut TxContext): Useless {
    Useless {
      id: object::new(ctx)
    }
  } 

  public fun destroy(self: Useless) {
    let Useless { id } = self;
    id.delete();
  }
}
