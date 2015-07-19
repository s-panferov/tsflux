/*
 * DEPS
 */

interface IEventEmitter {
    emit(name: string, ...args: any[]);
    addListener(name: string, callback: () => void);
    removeListener(name: string, callback: () => void);
}

interface FluxDispatcher<T> {
    register(foo: (action: T) => void);
    dispatch(action: T): void;
}

export interface IAction<T> {
    actionType?: T
}

export type IDispatcher<T> = FluxDispatcher<IAction<T>>;
export interface IDispatch<T> {
    (action: IAction<T>): void
}

export interface IFlux<ActionType, State> {
    events: IEventEmitter,
    dispatch: IDispatch<ActionType>,
    getState(): State
}

export interface IStateSlices<State> {
    currentState: State,
    prevState: State
}

export interface IStore<ActionType, StoreState, State> {
    name: string
    (state: StoreState, action: IAction<ActionType>,
        flux: IFlux<ActionType, State>, states?: IStateSlices<State>): StoreState
}

export function runFlux<ActionType, State>(stores: IStore<ActionType, any, State>[],
                           initialState: any,
                           ds: IDispatcher<ActionType>,
                           events: IEventEmitter,
                           fromJS: (obj: any) => any)
    : IFlux<ActionType, State> {

    let dispatch = (action) => {
        console.log('Dispatch', action);
        ds.dispatch(action);
    };

    let state: State;
    let states: IStateSlices<State> = {
        currentState: null,
        prevState: null
    };

    function getState() { return state };

    let flux: IFlux<ActionType, State> = { events, dispatch, getState };

    // Note: pseudo-store
    ds.register((action) => {
        // 1. Memoize prevState
        states.prevState = state;
    });

    let stateChanged = false;
    stores.forEach((store) => {
        ds.register((action) => {
            let prevStoreState = (state as any).get(store.name);
            let newStoreState = store(prevStoreState, action, flux, states) || prevStoreState;
            if (prevStoreState !== newStoreState) {
                if (!stateChanged) {
                    stateChanged = true;
                }

                console.log('State changed by',
                    '"' + store.name + '" store.\n  ',
                    prevStoreState.toJS(), ' -> ',
                    newStoreState.toJS());

                // Let's calc a new global state
                let newGlobalState = (state as any).set(store.name, newStoreState);

                // New global state is now current
                states.currentState = newGlobalState as any;

                // Update global state var
                state = newGlobalState as any;

                // Fire change event with store's name
                events.emit(store.name, newGlobalState, state);
            }
        });
    });

    // Note: pseudo-store
    ds.register((action) => {
        if (stateChanged) {
            events.emit('change');
            stateChanged = false;
        }
    });

    state = fromJS(initialState);

    return flux;
}

export interface IProviderProps<ActionType, State> extends __React.DOMAttributes {
    flux: IFlux<ActionType, State>
}

export interface IConnectorProps<ComponentState, State> extends __React.DOMAttributes {
    selector: (componentState: ComponentState, newAppState: State) => ComponentState;
    renderer: (props: any) => __React.ReactElement<any>;
}

export interface IConnectorState<ComponentState> {
    data: ComponentState
}

export interface IConnectorContext<ActionType, State> {
    flux: IFlux<ActionType, State>
}

function getDisplayName(Component) {
    return Component.displayName || Component.name || 'Component';
}

export interface IFluxProps<T> {
    dispatch?: IDispatch<T>
}

export function createAll<ActionType, State>(React: typeof __React, fromJS: (o: any) => any) {
    class Provider extends React.Component<IProviderProps<ActionType, State>, any> {
        static childContextTypes = {
            flux: React.PropTypes.object.isRequired
        };

        getChildContext() {
            return { flux: this.props.flux };
        }

        render() {
            const { children } = this.props;
            return (children as any)();
        }
    }

    class Connector<ComponentState> extends React.Component<IConnectorProps<ActionType, State>, IConnectorState<ComponentState>> {

        static contextTypes = {
            flux: React.PropTypes.object.isRequired
        };

        context: IConnectorContext<ActionType, State>

        constructor(props: IConnectorProps<ActionType, State>, context: IConnectorContext<ActionType, State>) {
            super(props, context);
            this.state = { data: fromJS({}) };
            this.handleChange = this.handleChange.bind(this);
        }

        componentWillMount() {
            this.context.flux.events.addListener('change', this.handleChange);

            // Extract initial data
            this.handleChange();
        }

        componentWillUnmount() {
            this.context.flux.events.removeListener('change', this.handleChange);
        }

        handleChange() {
            let newAppState = this.context.flux.getState();
            let newData = (this.state.data as any).withMutations(data => this.props.selector(data, newAppState));
            if (this.state.data !== newData) {
                this.setState({
                    data: newData
                });
            }
        }

        render() {
            const { renderer } = this.props;
            const { data } = this.state;
            const { flux: { dispatch } } = this.context;

            return renderer({ dispatch, data });
        }
    }

    function connect(selector) {
        return DecoratedComponent => class ConnectorDecorator extends React.Component<any, any> {
            static displayName = `Connector(${getDisplayName(DecoratedComponent)})`;
            static DecoratedComponent = DecoratedComponent;

            render() {
                let inner = (props) => <DecoratedComponent {...props} {...this.props} />;
                return (
                    <Connector selector={selector} renderer={ inner } />
                );
            }
        } as any;
    };

    return { Provider, Connector, connect }
}
